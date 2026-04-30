import LeaveRequestModel from "./leaverequest.model.js";
import EmployeeModel from "../employee/employee.model.js";
import UserAttendanceModel from "../userAttendance/userAttendance.model.js";
import CalendarService from "../holidays/holiday.service.js";
import NotificationService from "../../notifications/notification.service.js";
import LeaveBalanceHistoryService from "./leaveBalanceHistory.service.js";
import LeavePolicyService from "../leavePolicy/leavePolicy.service.js";
import ApprovalService from "../../approval/approval.service.js";
import logger from "../../../config/logger.js";

class LeaveService {
  // --- HELPER: Auto-Fill Attendance on Approval ---
  // This ensures the "Daily Dashboard" knows they are on leave weeks in advance.
  // G7: department-aware so per-department WeeklyOffPolicy / Holiday scoping
  // is respected (no "On Leave" rows on days that are weekly-offs for the
  // employee's department).
  static async fillAttendanceForLeave(leaveRequest) {
    const employee = await EmployeeModel.findById(leaveRequest.employeeId).select("department").lean();
    const department = employee?.department || null;

    const dayMap = await CalendarService.checkDayStatusRange(
      leaveRequest.fromDate, leaveRequest.toDate, department,
    );

    const leaveDates = [];
    let currentDate = new Date(leaveRequest.fromDate);
    const endDate = new Date(leaveRequest.toDate);

    while (currentDate <= endDate) {
      const key = currentDate.toISOString().split("T")[0];
      const dayStatus = dayMap.get(key) || { isWorkingDay: true };

      if (dayStatus.isWorkingDay) {
        leaveDates.push({
          updateOne: {
            filter: {
              employeeId: leaveRequest.employeeId,
              date: new Date(currentDate),
            },
            // UPSERT: Create if new, Update if exists.
            // IMPORTANT: We use $set to overwrite status to 'On Leave'
            update: {
              $set: {
                status: "On Leave",
                remarks: `Approved Leave: ${leaveRequest.leaveType} - ${leaveRequest.reason}`,
                // We don't overwrite checkIn data if they accidentally came to work
              },
            },
            upsert: true,
          },
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (leaveDates.length > 0) {
      await UserAttendanceModel.bulkWrite(leaveDates);
    }
  }

  // --- HELPER: Remove Attendance on Cancellation ---
  static async clearAttendanceForLeave(leaveRequest) {
    // Only delete records that have no actual punch-in (timeline is empty).
    // Preserves records where they physically came to work despite being on leave.
    await UserAttendanceModel.deleteMany({
      employeeId: leaveRequest.employeeId,
      date: { $gte: leaveRequest.fromDate, $lte: leaveRequest.toDate },
      status: "On Leave",
      "timeline.0": { $exists: false },
    });
  }

  // --- 1. APPLY FOR LEAVE ---
  static async applyLeave(data) {
    let {
      employeeId,
      leaveType,
      requestType,
      fromDate,
      toDate,
      reason,
      shortLeaveTime,
      coveringEmployeeId,
    } = data;

    // A. Validate Dates
    const start = new Date(fromDate);
    const end = new Date(toDate);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(0, 0, 0, 0);

    if (start > end)
      throw {
        statusCode: 400,
        message: "End date cannot be before start date.",
      };

    // Helper to format dates
    const dateStr = (d) => new Date(d).toLocaleDateString("en-GB");

    // ---------------------------------------------------------
    // 🛑 1. GLOBAL PENDING LOCK (Strict "One at a Time" Policy)
    // ---------------------------------------------------------
    // Check if the user has ANY request currently processing.
    // We REMOVED the date check here. If you have a pending request, you are blocked.
    const hasPending = await LeaveRequestModel.findOne({
      employeeId,
      status: { $in: ["Pending"] },
    });

    if (hasPending) {
      throw {
        statusCode: 400,
        message: `Action Required: You already have a pending request applied on ${dateStr(hasPending.createdAt)}. Please wait for it to be processed before applying for a new one.`,
      };
    }

    // ---------------------------------------------------------
    // 🛑 2. APPROVED OVERLAP CHECK (Date Clash Preventer)
    // ---------------------------------------------------------
    // Since we passed Step 1, we know there are no pending requests.
    // Now we check if the requested dates clash with an APPROVED leave.
    const overlap = await LeaveRequestModel.findOne({
      employeeId,
      status: { $in: ["Manager Approved", "HR Approved", "Approved"] },
      $or: [{ fromDate: { $lte: end }, toDate: { $gte: start } }],
    });

    if (overlap) {
      if (
        overlap.requestType === "Short Leave" &&
        requestType === "Short Leave"
      ) {
        throw {
          statusCode: 409,
          message: `You already have an Approved Permission for ${dateStr(overlap.fromDate)}.`,
        };
      }
      throw {
        statusCode: 409,
        message: `Overlap Detected: You have an Approved ${overlap.leaveType} from ${dateStr(overlap.fromDate)} to ${dateStr(overlap.toDate)}.`,
      };
    }

    // ---------------------------------------------------------
    // Resolve LeavePolicy ONCE for all downstream checks
    // ---------------------------------------------------------
    const employeeForPolicy = await EmployeeModel.findById(employeeId).select("department dateOfJoining hrStatus name leaveBalance").lean();
    if (!employeeForPolicy) throw { statusCode: 404, message: "Employee not found." };

    const policy = await LeavePolicyService.resolveForEmployee(employeeForPolicy);
    const rule   = LeavePolicyService.getRule(policy, leaveType);

    // 3a. Probation eligibility
    if (rule && rule.probationEligible === false && LeavePolicyService.isOnProbation(employeeForPolicy)) {
      throw { statusCode: 403, message: `${leaveType} leave is not available while on probation.` };
    }

    // 3b. Notice-period check (only for Full Day / Half-Day; Short Leave skipped)
    if (rule?.minNoticeDays > 0 && requestType !== "Short Leave") {
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const noticeMs = rule.minNoticeDays * 24 * 60 * 60 * 1000;
      if (start.getTime() - today.getTime() < noticeMs) {
        throw {
          statusCode: 400,
          message: `${leaveType} leave requires ${rule.minNoticeDays} day(s) advance notice.`,
        };
      }
    }

    // 3c. Maximum consecutive days
    const requestedSpanDays = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
    if (rule?.maxConsecutiveDays && requestedSpanDays > rule.maxConsecutiveDays) {
      throw {
        statusCode: 400,
        message: `${leaveType} leave cannot exceed ${rule.maxConsecutiveDays} consecutive days (requested ${requestedSpanDays}).`,
      };
    }

    // 3d. Blackout-window check
    const blackout = LeavePolicyService.checkBlackout(rule, start, end);
    if (blackout) {
      throw {
        statusCode: 400,
        message: `Leave overlaps a blackout window (${dateStr(blackout.from)} – ${dateStr(blackout.to)}${blackout.reason ? ` — ${blackout.reason}` : ""}).`,
      };
    }

    // ---------------------------------------------------------
    // 🛑 3. PERMISSION (SHORT LEAVE) QUOTA CHECK — uses policy.monthlyCap
    // ---------------------------------------------------------
    if (requestType === "Short Leave") {
      if (!shortLeaveTime?.from || !shortLeaveTime?.to) {
        throw {
          statusCode: 400,
          message: "Please specify 'From' and 'To' time for the permission.",
        };
      }

      const reqYear = start.getFullYear();
      const reqMonth = start.getMonth();
      const startOfMonth = new Date(reqYear, reqMonth, 1);
      const endOfMonth = new Date(reqYear, reqMonth + 1, 0, 23, 59, 59);

      const permissionRule = LeavePolicyService.getRule(policy, "Permission");
      const monthlyCap = permissionRule?.monthlyCap ?? 3;

      const usedPermissions = await LeaveRequestModel.countDocuments({
        employeeId,
        requestType: "Short Leave",
        status: { $in: ["Manager Approved", "HR Approved", "Approved"] },
        fromDate: { $gte: startOfMonth, $lte: endOfMonth },
      });

      if (usedPermissions >= monthlyCap) {
        const monthName = start.toLocaleString("default", { month: "long" });
        throw {
          statusCode: 400,
          message: `Permission Limit Exceeded. You have already used ${usedPermissions}/${monthlyCap} permissions for ${monthName}.`,
        };
      }
    }

    // ---------------------------------------------------------
    // 🚀 4. CALCULATE DAYS & VALIDATE WORKING DAYS
    // B8 fix: single batched lookup instead of one-per-day query.
    // ---------------------------------------------------------
    let calculatedDays = 0;
    const nonWorkingDaysEntry = [];

    const dayMap = await CalendarService.checkDayStatusRange(start, end, employeeForPolicy?.department || null);

    for (let loopDate = new Date(start); loopDate <= end; loopDate.setDate(loopDate.getDate() + 1)) {
      const key = loopDate.toISOString().split("T")[0];
      const dayStatus = dayMap.get(key) || { isWorkingDay: true, reason: "Regular Working Day" };

      if (dayStatus.isWorkingDay) {
        if (requestType === "Short Leave") {
          calculatedDays += 0; // Permissions do not deduct days
        } else if (
          requestType === "First Half" ||
          requestType === "Second Half"
        ) {
          calculatedDays += 0.5;
        } else {
          calculatedDays += 1;
        }
      } else {
        nonWorkingDaysEntry.push({
          date: new Date(loopDate),
          reason: dayStatus.reason,
        });
      }
    }

    // Validation: Cannot take permission on a Holiday/Sunday
    if (requestType === "Short Leave" && nonWorkingDaysEntry.length > 0) {
      throw {
        statusCode: 400,
        message: "Permissions cannot be taken on Holidays or Week-offs.",
      };
    }

    // ---------------------------------------------------------
    // 5. CHECK BALANCE
    // ---------------------------------------------------------
    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) throw { statusCode: 404, message: "Employee not found." };

    // Leave types that use numeric balance fields
    const BALANCE_CHECKED_TYPES = ["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement"];

    if (requestType !== "Short Leave") {
      if (BALANCE_CHECKED_TYPES.includes(leaveType)) {
        const currentBalance = employee.leaveBalance[leaveType] ?? 0;
        if (currentBalance < calculatedDays) {
          throw {
            statusCode: 400,
            message: `Insufficient ${leaveType} balance. Need: ${calculatedDays}, Available: ${currentBalance}`,
          };
        }
      }
      // LWP, CompOff, Permission — handled separately (CompOff uses array logic in actionLeave)
    }

    // 5b. Documentation expectation: surfaced on the LeaveRequest so the
    // approver UI can highlight it. Persisted via newLeave below.
    const docsExpected = !!(rule?.docsRequiredAfterDays
      && calculatedDays > rule.docsRequiredAfterDays
      && !data.attachmentUrl);

    // ---------------------------------------------------------
    // A1: Auto-approve eligibility (per LeavePolicyRule.autoApproveUnderDays)
    // For Short-Leave we treat the request span as 0.5 day so a permission
    // ≤4 hr fits a "≤1 day" auto-approve threshold.
    // ---------------------------------------------------------
    const span = requestType === "Short Leave" ? 0.5 : calculatedDays;
    const autoApprove = !!(rule?.autoApproveUnderDays && span <= rule.autoApproveUnderDays);

    // ---------------------------------------------------------
    // 6. CREATE & SAVE
    // ---------------------------------------------------------
    const newLeave = new LeaveRequestModel({
      employeeId,
      leaveType,
      requestType,
      fromDate: start,
      toDate: end,
      totalDays: calculatedDays,
      nonWorkingDays: nonWorkingDaysEntry,
      reason,
      shortLeaveTime,
      coveringEmployeeId,
      status: autoApprove ? "HR Approved" : "Pending",
      finalApprovedBy:   autoApprove ? employeeId : null,
      finalApprovalDate: autoApprove ? new Date() : null,
      workflowLogs: [
        { action: "Applied", actionBy: employeeId, role: "Employee", remarks: reason },
        ...(docsExpected
          ? [{ action: "Applied", actionBy: null, role: "System",
               remarks: `Supporting documents expected (>${rule.docsRequiredAfterDays} day(s) ${leaveType})` }]
          : []),
        ...(autoApprove
          ? [{
              action: "Approved", actionBy: null, role: "System",
              remarks: `Auto-approved per policy (autoApproveUnderDays=${rule.autoApproveUnderDays})`,
            }]
          : []),
      ],
    });

    await newLeave.save();

    if (autoApprove) {
      // Debit balance + sync attendance immediately so the rest of the system
      // sees a fully-finalized leave.
      const BALANCE_TYPES = ["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement"];
      if (BALANCE_TYPES.includes(leaveType)) {
        const before = employee.leaveBalance?.[leaveType] ?? 0;
        if (before >= calculatedDays) {
          employee.leaveBalance[leaveType] = before - calculatedDays;
          await employee.save();
          await LeaveBalanceHistoryService.logDebit({
            employeeId, leaveType, amount: calculatedDays, balanceBefore: before,
            leaveRequestId: newLeave._id, performedBy: null,
            reason: `Auto-approved leave — ${start.toISOString().split("T")[0]} to ${end.toISOString().split("T")[0]}`,
          }).catch(() => {});
        }
      } else if (leaveType === "CompOff") {
        // G4: pick + mark valid (unused, unexpired) credits, FIFO by expiry.
        const now = new Date();
        const valid = (employee.leaveBalance?.compOff || [])
          .map((credit, index) => ({ credit, index }))
          .filter((it) => !it.credit.isUsed && new Date(it.credit.expiryDate) > now)
          .sort((a, b) => new Date(a.credit.expiryDate) - new Date(b.credit.expiryDate));
        if (valid.length >= calculatedDays) {
          for (let i = 0; i < calculatedDays; i++) {
            employee.leaveBalance.compOff[valid[i].index].isUsed = true;
          }
          await employee.save();
          await LeaveBalanceHistoryService.logDebit({
            employeeId, leaveType: "CompOff", amount: calculatedDays,
            balanceBefore: valid.length, leaveRequestId: newLeave._id, performedBy: null,
            reason: `Auto-approved CompOff — ${start.toISOString().split("T")[0]} to ${end.toISOString().split("T")[0]}`,
          }).catch(() => {});
        } else {
          // Not enough credits — revert auto-approve and rethrow.
          await LeaveRequestModel.findByIdAndDelete(newLeave._id);
          throw {
            statusCode: 400,
            message: `Cannot auto-approve CompOff. Available: ${valid.length}, Required: ${calculatedDays}`,
          };
        }
      }
      try {
        await this.fillAttendanceForLeave(newLeave);
      } catch (err) { logger.warn({ context: "leave.autoApprove.attendance", message: err.message }); }

      NotificationService.notify({
        title: "Leave Auto-Approved",
        message: `Your ${leaveType} request from ${start.toLocaleDateString("en-GB")} to ${end.toLocaleDateString("en-GB")} was auto-approved per policy.`,
        audienceType: "user",
        users: [employeeId],
        category: "approval",
        priority: "low",
        module: "hr",
        reference: { model: "LeaveRequest", documentId: newLeave._id },
        actionUrl: `/dashboard/profile`,
        actionLabel: "View Leave",
      }).catch(() => {});

      return newLeave;
    }

    // ── Approval engine integration ──────────────────────────────────────
    try {
      await ApprovalService.initiate({
        source_type:  "LeaveRequest",
        source_ref:   newLeave._id,
        source_no:    `LV-${newLeave._id.toString().slice(-6).toUpperCase()}`,
        amount:       calculatedDays,
        narration:    `${leaveType} leave by ${employee.name}`,
        initiator_id: employeeId,
      });
    } catch (err) {
      logger.warn({ context: "leave.approval.initiate", message: err.message });
    }

    // A3: route the manager-notification through the active delegation chain.
    if (employee.reportsTo) {
      const EmployeeService = (await import("../employee/employee.service.js")).default;
      const activeManager = await EmployeeService.resolveActiveManager(employee.reportsTo);
      if (activeManager) {
        NotificationService.notify({
          title: "New Leave Request",
          message: `${employee.name} has applied for ${leaveType} leave from ${start.toLocaleDateString("en-GB")} to ${end.toLocaleDateString("en-GB")}`,
          audienceType: "user",
          users: [activeManager],
          category: "approval",
          priority: "high",
          module: "hr",
          reference: { model: "LeaveRequest", documentId: newLeave._id },
          actionUrl: `/dashboard/profile`,
          actionLabel: "Review Request",
          createdBy: employeeId,
        });
      }
    }

    return newLeave;
  }

  // --- 2. ACTION LEAVE (Approve/Reject) ---
  //
  // Three-stage approval pipeline — Manager → HOD (optional) → HR — with:
  //   • B10 atomic Processing claim (no double-debit between legacy + engine)
  //   • H4 refund-on-reject when balance was already debited at Manager stage
  //   • H4 graceful HOD skip when policy requires HOD but the department has
  //     no headId configured (logs a warning, hands off to HR directly)
  //
  // Balance debit happens once at the Manager stage (legacy behaviour); HOD
  // and HR stages just route. Reject from Manager-Approved or HOD-Approved
  // refunds the balance + clears the pre-filled "On Leave" attendance rows.
  static async actionLeave(data) {
    const { leaveRequestId, actionBy, role, action, remarks } = data;

    // ── 1. Pre-flight: load fresh + resolve policy + HOD reachability ──
    const fresh = await LeaveRequestModel.findById(leaveRequestId)
      .select("status leaveType employeeId totalDays fromDate toDate")
      .lean();
    if (!fresh) throw { statusCode: 404, message: "Request not found." };

    const employeeForPolicy = await EmployeeModel.findById(fresh.employeeId)
      .select("department dateOfJoining hrStatus name").lean();
    if (!employeeForPolicy) throw { statusCode: 404, message: "Employee not found." };

    const policy   = await LeavePolicyService.resolveForEmployee(employeeForPolicy);
    const rule     = LeavePolicyService.getRule(policy, fresh.leaveType);
    const policyHOD = LeavePolicyService.needsHOD(rule, fresh);
    const hodId     = policyHOD ? await LeavePolicyService.resolveHODForEmployee(employeeForPolicy) : null;
    // If policy says HOD is required but no headId is set on the department,
    // we silently skip the HOD step rather than block all approvals.
    const effectiveNeedsHOD = policyHOD && !!hodId;
    if (policyHOD && !hodId) {
      logger.warn({
        context: "leave.actionLeave.hodSkipped",
        employeeId: String(fresh.employeeId),
        department: employeeForPolicy.department,
        reason: "Policy requires HOD but Department.headId is unset",
      });
    }
    const needsHR = rule?.requiresHRApproval !== false;

    // ── 2. Validate role/status transition ─────────────────────────────
    let prevStatus;
    let nextStatus;
    let isFinal = false;

    if (action === "Approve") {
      if (role === "Manager") {
        if (fresh.status !== "Pending") {
          throw { statusCode: 409, message: `Manager can only approve Pending requests (current: ${fresh.status})` };
        }
        prevStatus = "Pending";
        const stage = LeavePolicyService.getNextStage({ role: "Manager", effectiveNeedsHOD, needsHR });
        nextStatus = stage.status;
        isFinal    = stage.isFinal;
      } else if (role === "HOD") {
        if (!effectiveNeedsHOD) {
          throw { statusCode: 400, message: "HOD approval is not required for this leave (policy or department configuration)." };
        }
        if (fresh.status !== "Manager Approved") {
          throw { statusCode: 409, message: `HOD can only approve Manager-Approved requests (current: ${fresh.status})` };
        }
        prevStatus = "Manager Approved";
        const stage = LeavePolicyService.getNextStage({ role: "HOD", effectiveNeedsHOD, needsHR });
        nextStatus = stage.status;
        isFinal    = stage.isFinal;
      } else if (role === "HR") {
        if (effectiveNeedsHOD && fresh.status === "Manager Approved") {
          throw { statusCode: 400, message: "HOD approval is required before HR can sign off." };
        }
        if (!["Manager Approved", "HOD Approved"].includes(fresh.status)) {
          throw { statusCode: 409, message: `HR can only approve Manager-/HOD-Approved requests (current: ${fresh.status})` };
        }
        prevStatus = fresh.status;
        nextStatus = "HR Approved";
        isFinal    = true;
      } else {
        throw { statusCode: 400, message: `Unknown role '${role}'` };
      }
    } else if (action === "Reject") {
      if (["Rejected", "Cancelled", "HR Approved"].includes(fresh.status)) {
        throw { statusCode: 409, message: `Request is already ${fresh.status}` };
      }
      prevStatus = fresh.status;
    } else {
      throw { statusCode: 400, message: `Unknown action '${action}'` };
    }

    // ── 3. Atomic claim of Processing ──────────────────────────────────
    const leaveRequest = await LeaveRequestModel.findOneAndUpdate(
      { _id: leaveRequestId, status: prevStatus },
      { $set: { status: "Processing" } },
      { new: true },
    );
    if (!leaveRequest) {
      const recheck = await LeaveRequestModel.findById(leaveRequestId).select("status").lean();
      throw { statusCode: 409, message: `Race condition — request is now ${recheck?.status}` };
    }

    try {
      const employee = await EmployeeModel.findById(leaveRequest.employeeId);
      if (!employee) throw { statusCode: 404, message: "Employee not found." };

      // ── 4. Side effects ──────────────────────────────────────────────
      if (action === "Approve") {
        // Balance debit + attendance fill happen ONCE — at the Manager stage
        // (legacy behaviour). HOD and HR stages just route.
        if (role === "Manager") {
          if (leaveRequest.leaveType === "CompOff") {
            // SCENARIO A: CompOff — pick valid credits FIFO by expiry.
            const now = new Date();
            const daysToDeduct = leaveRequest.totalDays;
            const validIndices = employee.leaveBalance.compOff
              .map((credit, index) => ({ credit, index }))
              .filter((it) => !it.credit.isUsed && new Date(it.credit.expiryDate) > now)
              .sort((a, b) => new Date(a.credit.expiryDate) - new Date(b.credit.expiryDate));
            if (validIndices.length < daysToDeduct) {
              throw {
                statusCode: 400,
                message: `Cannot Approve. Insufficient valid Comp Offs. Available: ${validIndices.length}, Required: ${daysToDeduct}`,
              };
            }
            for (let i = 0; i < daysToDeduct; i++) {
              employee.leaveBalance.compOff[validIndices[i].index].isUsed = true;
            }
            await employee.save();
            await LeaveBalanceHistoryService.logDebit({
              employeeId:     leaveRequest.employeeId,
              leaveType:      "CompOff",
              amount:         daysToDeduct,
              balanceBefore:  validIndices.length,
              leaveRequestId: leaveRequest._id,
              performedBy:    actionBy,
              reason: `CompOff Approved (${role}) — ${leaveRequest.fromDate.toISOString().split("T")[0]} to ${leaveRequest.toDate.toISOString().split("T")[0]}`,
            });
          } else if (["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement"].includes(leaveRequest.leaveType)) {
            // SCENARIO B: numeric balance-tracked leaves
            const available = employee.leaveBalance[leaveRequest.leaveType] ?? 0;
            if (available < leaveRequest.totalDays) {
              throw {
                statusCode: 400,
                message: `Cannot Approve. Insufficient ${leaveRequest.leaveType} balance. Available: ${available}, Required: ${leaveRequest.totalDays}`,
              };
            }
            employee.leaveBalance[leaveRequest.leaveType] -= leaveRequest.totalDays;
            await employee.save();
            await LeaveBalanceHistoryService.logDebit({
              employeeId:     leaveRequest.employeeId,
              leaveType:      leaveRequest.leaveType,
              amount:         leaveRequest.totalDays,
              balanceBefore:  available,
              leaveRequestId: leaveRequest._id,
              performedBy:    actionBy,
              reason: `Leave Approved (Manager) — ${leaveRequest.fromDate.toISOString().split("T")[0]} to ${leaveRequest.toDate.toISOString().split("T")[0]}`,
            });
          }
          // LWP / Permission — no balance to debit

          // Pre-fill attendance rows for the working days in the leave window
          await this.fillAttendanceForLeave(leaveRequest);
        }

        leaveRequest.status = nextStatus;
        if (isFinal) {
          leaveRequest.finalApprovedBy   = actionBy;
          leaveRequest.finalApprovalDate = new Date();
        }
      } else if (action === "Reject") {
        // H4: refund balance + clear attendance pre-fills if the leave had
        // already been debited (i.e. it was past the Manager stage).
        const wasDebited = ["Manager Approved", "HOD Approved"].includes(prevStatus);
        if (wasDebited) {
          if (leaveRequest.leaveType === "CompOff") {
            // Reverse the most-recently-used credits that match this leave's day count
            const used = employee.leaveBalance.compOff
              .map((credit, index) => ({ credit, index }))
              .filter((it) => it.credit.isUsed)
              .sort((a, b) => new Date(b.credit.earnedDate) - new Date(a.credit.earnedDate));
            const restoreCount = Math.min(used.length, leaveRequest.totalDays);
            for (let i = 0; i < restoreCount; i++) {
              employee.leaveBalance.compOff[used[i].index].isUsed = false;
            }
            await employee.save();
            await LeaveBalanceHistoryService.logCredit({
              employeeId:     leaveRequest.employeeId,
              leaveType:      "CompOff",
              amount:         restoreCount,
              balanceBefore:  used.length,
              leaveRequestId: leaveRequest._id,
              performedBy:    actionBy,
              reason:         `Rejected at ${prevStatus} — CompOff credits restored`,
            }).catch(() => {});
          } else if (["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement"].includes(leaveRequest.leaveType)) {
            const before = employee.leaveBalance[leaveRequest.leaveType] ?? 0;
            employee.leaveBalance[leaveRequest.leaveType] = before + leaveRequest.totalDays;
            await employee.save();
            await LeaveBalanceHistoryService.logCredit({
              employeeId:     leaveRequest.employeeId,
              leaveType:      leaveRequest.leaveType,
              amount:         leaveRequest.totalDays,
              balanceBefore:  before,
              leaveRequestId: leaveRequest._id,
              performedBy:    actionBy,
              reason:         `Rejected at ${prevStatus} — balance refunded`,
            }).catch(() => {});
          }
          // Clear pre-filled "On Leave" rows
          await this.clearAttendanceForLeave(leaveRequest);
        }

        leaveRequest.status          = "Rejected";
        leaveRequest.rejectionReason = remarks;
      }

      leaveRequest.workflowLogs.push({
        action: action === "Approve" ? "Approved" : "Rejected",
        actionBy: actionBy,
        role: role,
        remarks: remarks,
      });
      await leaveRequest.save();

      // ── 5. Downstream notifications ─────────────────────────────────
      if (action === "Approve" && !isFinal) {
        // Notify the next stage's approvers.
        if (role === "Manager" && effectiveNeedsHOD && hodId) {
          NotificationService.notify({
            title: "Leave needs HOD approval",
            message: `${employee.name} — ${leaveRequest.leaveType} leave (Manager-approved) is awaiting your sign-off.`,
            audienceType: "user",
            users: [hodId],
            category: "approval",
            priority: "high",
            module: "hr",
            reference: { model: "LeaveRequest", documentId: leaveRequest._id },
            actionUrl: "/dashboard/profile",
            actionLabel: "Review Request",
            createdBy: actionBy,
          }).catch(() => {});
        } else if (needsHR) {
          // Manager (skip HOD) or HOD — next is HR
          const hrRoles = await NotificationService.getRoleIdsByPermission("hr", "leave", "edit");
          if (hrRoles.length > 0) {
            NotificationService.notify({
              title: "Leave awaiting HR sign-off",
              message: `${employee.name} — ${leaveRequest.leaveType} leave (${nextStatus}) is awaiting HR sign-off.`,
              audienceType: "role",
              roles: hrRoles,
              category: "approval",
              priority: "medium",
              module: "hr",
              reference: { model: "LeaveRequest", documentId: leaveRequest._id },
              actionUrl: "/dashboard/profile",
              actionLabel: "Review Request",
              createdBy: actionBy,
            }).catch(() => {});
          }
        }
      }

      // Always notify the applicant on the final transition.
      NotificationService.notify({
        title: action === "Approve"
          ? (isFinal ? "Leave Approved" : `Leave moved to ${nextStatus}`)
          : "Leave Rejected",
        message: action === "Approve"
          ? (isFinal
              ? `Your ${leaveRequest.leaveType} leave from ${new Date(leaveRequest.fromDate).toLocaleDateString("en-GB")} to ${new Date(leaveRequest.toDate).toLocaleDateString("en-GB")} has been approved.`
              : `Your ${leaveRequest.leaveType} leave moved to ${nextStatus} — pending the next approver.`)
          : `Your ${leaveRequest.leaveType} leave request has been rejected.${remarks ? " Reason: " + remarks : ""}`,
        audienceType: "user",
        users: [leaveRequest.employeeId],
        category: action === "Approve" ? "approval" : "alert",
        priority: action === "Approve" ? "medium" : "high",
        module: "hr",
        reference: { model: "LeaveRequest", documentId: leaveRequest._id },
        actionUrl: "/dashboard/profile",
        actionLabel: "View Leave",
        createdBy: actionBy,
      }).catch(() => {});

      return leaveRequest;
    } catch (err) {
      // B10: roll the transient "Processing" status back to whatever we
      // claimed it from so a retry can run cleanly.
      try {
        await LeaveRequestModel.updateOne(
          { _id: leaveRequestId, status: "Processing" },
          { $set: { status: prevStatus } },
        );
      } catch (_) { /* best-effort rollback */ }
      throw err;
    }
  }

  // --- A6: BULK ACTION — manager/HR approves or rejects N leaves at once ---
  // Returns { processed: [ids], failed: [{ id, message }] } so the client
  // can show partial-success UX.
  static async bulkActionLeave({ leaveRequestIds = [], actionBy, role, action, remarks }) {
    if (!Array.isArray(leaveRequestIds) || leaveRequestIds.length === 0) {
      throw { statusCode: 400, message: "leaveRequestIds must be a non-empty array" };
    }
    const results = { processed: [], failed: [] };
    for (const id of leaveRequestIds) {
      try {
        await LeaveService.actionLeave({ leaveRequestId: id, actionBy, role, action, remarks });
        results.processed.push(id);
      } catch (err) {
        results.failed.push({ id, message: err?.message || "Unknown error" });
      }
    }
    return results;
  }

  // --- A7 + H5: my-pending-approvals aggregator ---
  // Returns three buckets the caller can act on:
  //   • asManager — Pending leaves from direct + delegated team
  //   • asHOD     — Manager-Approved leaves whose employee.department's
  //                 Department.headId is the caller (only when policy says
  //                 requiresHODApproval=true)
  //   • asHR      — Manager-Approved or HOD-Approved leaves company-wide,
  //                 gated by hr.leave.edit permission
  static async getMyPendingApprovals(approverObjectId) {
    const RoleModel = (await import("../../role/role.model.js")).default;
    const DepartmentModel = (await import("../department/department.model.js")).default;

    // ── asManager: direct + delegated team ───────────────────────────
    const direct = await EmployeeModel.find({ reportsTo: approverObjectId }).select("_id");
    const delegators = await EmployeeModel
      .find({ delegateTo: approverObjectId, delegateUntil: { $gt: new Date() } })
      .select("_id");
    let delegatedReports = [];
    if (delegators.length) {
      delegatedReports = await EmployeeModel
        .find({ reportsTo: { $in: delegators.map((d) => d._id) } })
        .select("_id");
    }
    const teamIds = [...direct.map((t) => t._id), ...delegatedReports.map((t) => t._id)];

    const asManager = teamIds.length === 0 ? [] : await LeaveRequestModel
      .find({ employeeId: { $in: teamIds }, status: "Pending" })
      .populate("employeeId", "name designation department photoUrl employeeId leaveBalance")
      .sort({ fromDate: 1 })
      .lean();

    // ── asHOD: caller is headId of one or more active Departments ────
    const myDepartments = await DepartmentModel
      .find({ headId: approverObjectId, isActive: true })
      .select("name").lean();
    let asHOD = [];
    if (myDepartments.length > 0) {
      const deptNames = myDepartments.map((d) => d.name);
      const deptEmployees = await EmployeeModel
        .find({ department: { $in: deptNames } })
        .select("_id department dateOfJoining hrStatus").lean();
      const deptEmpIds = deptEmployees.map((e) => e._id);
      const candidates = deptEmpIds.length === 0 ? [] : await LeaveRequestModel
        .find({ employeeId: { $in: deptEmpIds }, status: "Manager Approved" })
        .populate("employeeId", "name designation department photoUrl employeeId leaveBalance dateOfJoining hrStatus")
        .sort({ fromDate: 1 })
        .lean();
      // Filter to leaves where the active rule actually requires HOD approval.
      // We check policy per leave so we don't surface things the HOD can't act on.
      for (const lv of candidates) {
        const policy = await LeavePolicyService.resolveForEmployee(lv.employeeId);
        const rule   = LeavePolicyService.getRule(policy, lv.leaveType);
        if (LeavePolicyService.needsHOD(rule, lv)) asHOD.push(lv);
      }
    }

    // ── asHR: gate on the caller's role permissions ──────────────────
    const me = await EmployeeModel.findById(approverObjectId).select("role").lean();
    let hasHRPermission = false;
    if (me?.role) {
      const role = await RoleModel.findById(me.role).lean();
      hasHRPermission = !!role?.permissions?.hr?.leave?.edit;
    }
    const asHR = !hasHRPermission ? [] : await LeaveRequestModel
      .find({ status: { $in: ["Manager Approved", "HOD Approved"] } })
      .populate("employeeId", "name designation department photoUrl employeeId leaveBalance")
      .sort({ fromDate: 1 })
      .lean();

    return {
      asManager,
      asHOD,
      asHR,
      total: asManager.length + asHOD.length + asHR.length,
    };
  }

  // --- A2: WITHDRAW LEAVE (pre-approval only) ---
  // Allowed only while the request is still Pending. No balance refund needed —
  // nothing was debited yet. Logs a Cancelled workflow row and ends the lifecycle.
  static async withdrawLeave({ leaveRequestId, withdrawnBy }) {
    const leave = await LeaveRequestModel.findById(leaveRequestId);
    if (!leave) throw { statusCode: 404, message: "Request not found" };
    if (leave.status !== "Pending") {
      throw {
        statusCode: 400,
        message: `Cannot withdraw — current status is "${leave.status}". Use /leave/cancel for the post-approval flow.`,
      };
    }
    if (String(leave.employeeId) !== String(withdrawnBy)) {
      throw { statusCode: 403, message: "Only the requester can withdraw their own leave." };
    }

    leave.status            = "Cancelled";
    leave.isCancelled       = true;
    leave.cancelledAt       = new Date();
    leave.cancellationReason = "Withdrawn by employee (pre-approval)";
    leave.workflowLogs.push({
      action: "Cancelled",
      actionBy: withdrawnBy,
      role: "Employee",
      remarks: "Withdrawn (no balance impact — was Pending)",
    });
    await leave.save();
    return { message: "Leave withdrawn." };
  }

  // --- 3. CANCEL LEAVE (The Edge Case Fix) ---
  static async cancelLeave(data) {
    const { leaveRequestId, cancelledBy } = data;
    const leaveRequest = await LeaveRequestModel.findById(leaveRequestId);

    if (!leaveRequest) throw { statusCode: 404, message: "Request not found" };
    if (
      leaveRequest.status === "Cancelled" ||
      leaveRequest.status === "Rejected"
    ) {
      throw { statusCode: 400, message: "Request is already inactive" };
    }

    // A. Refund balance if leave was already approved (Manager / HOD / HR)
    if (
      ["Manager Approved", "HOD Approved", "HR Approved"].includes(leaveRequest.status) &&
      leaveRequest.leaveType !== "LWP" &&
      leaveRequest.leaveType !== "CompOff"
    ) {
      const employeeForRefund = await EmployeeModel.findById(leaveRequest.employeeId);
      const balanceBefore = employeeForRefund?.leaveBalance?.[leaveRequest.leaveType] ?? 0;

      await EmployeeModel.findByIdAndUpdate(leaveRequest.employeeId, {
        $inc: { [`leaveBalance.${leaveRequest.leaveType}`]: leaveRequest.totalDays },
      });

      // Log balance credit
      await LeaveBalanceHistoryService.logCredit({
        employeeId:    leaveRequest.employeeId,
        leaveType:     leaveRequest.leaveType,
        amount:        leaveRequest.totalDays,
        balanceBefore,
        leaveRequestId: leaveRequest._id,
        performedBy:   cancelledBy || null,
        reason: `Leave Cancelled — ${leaveRequest.totalDays} day(s) refunded`,
      });

      // B. Clear the pre-filled "On Leave" attendance records
      await this.clearAttendanceForLeave(leaveRequest);
    }

    leaveRequest.status = "Cancelled";
    leaveRequest.isCancelled = true;
    leaveRequest.cancelledAt = new Date();
    leaveRequest.workflowLogs.push({
      action: "Cancelled",
      actionBy: cancelledBy,
      role: "User/HR",
    });

    await leaveRequest.save();
    return { message: "Leave cancelled and balance refunded." };
  }

  // --- 4. GET MY LEAVES ---
  static async getMyLeaves(employeeId, status) {
    const query = { employeeId };
    if (status) query.status = status;

    return await LeaveRequestModel.find(query)
      .sort({ fromDate: -1 })
      .populate("coveringEmployeeId", "name designation");
  }

  // --- 5. GET PENDING APPROVALS (Manager view, A3-delegation aware) ---
  // Includes:
  //   • employees who report to me directly
  //   • employees whose direct manager has delegated to me right now
  static async getPendingLeavesForManager(managerId) {
    const direct = await EmployeeModel.find({ reportsTo: managerId }).select("_id");
    const delegators = await EmployeeModel
      .find({ delegateTo: managerId, delegateUntil: { $gt: new Date() } })
      .select("_id");
    let delegatedReports = [];
    if (delegators.length > 0) {
      delegatedReports = await EmployeeModel
        .find({ reportsTo: { $in: delegators.map((d) => d._id) } })
        .select("_id");
    }
    const teamIds = [
      ...direct.map((t) => t._id),
      ...delegatedReports.map((t) => t._id),
    ];
    if (teamIds.length === 0) return [];

    return await LeaveRequestModel.find({
      employeeId: { $in: teamIds },
      status: "Pending",
    })
      .populate("employeeId", "name designation photoUrl leaveBalance reportsTo")
      .sort({ fromDate: 1 });
  }

  // --- LP7: HR records a life event and grants the corresponding leave balance ---
  // Idempotent on (employeeId, eventType, eventDate). Logs an EventGrant row.
  static async grantEventLeave({ employeeId, eventType, eventDate, leaveType, days, docsUrl, notes, recordedBy }) {
    if (!employeeId)  throw { statusCode: 400, message: "employeeId is required" };
    if (!eventType)   throw { statusCode: 400, message: "eventType is required" };
    if (!eventDate)   throw { statusCode: 400, message: "eventDate is required" };
    if (!leaveType)   throw { statusCode: 400, message: "leaveType is required" };

    const LifeEventModel = (await import("../leavePolicy/lifeEvent.model.js")).default;

    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) throw { statusCode: 404, message: "Employee not found" };

    const policy = await LeavePolicyService.resolveForEmployee(employee);
    const rule   = LeavePolicyService.getRule(policy, leaveType);
    if (!rule) {
      throw { statusCode: 400, message: `${leaveType} is not a recognised leave type` };
    }
    // /leave/grant is a top-up channel — it works regardless of refillType so
    // HR can record a life event and credit balance even when the rule is
    // ANNUAL_RESET (the default for Maternity/Paternity/Bereavement). It does
    // refuse if the rule is configured as MANUAL_ONLY *and* no `days` value
    // was passed (no entitlement to fall back to).
    const grantDays = Number(days || rule.annualEntitlement || 0);
    if (grantDays <= 0) {
      throw { statusCode: 400, message: "Grant amount must be > 0 — pass `days` or configure rule.annualEntitlement" };
    }

    // Idempotency — try-create with unique index
    let event;
    try {
      event = await LifeEventModel.create({
        employeeId,
        eventType,
        eventDate: new Date(eventDate),
        docsUrl,
        notes,
        grantedLeaveType: leaveType,
        grantedDays: grantDays,
        recordedBy: recordedBy || null,
      });
    } catch (err) {
      if (err?.code === 11000) {
        throw { statusCode: 409, message: "This life event is already recorded for the employee on that date." };
      }
      throw err;
    }

    const before = employee.leaveBalance?.[leaveType] ?? 0;
    employee.leaveBalance[leaveType] = before + grantDays;
    await employee.save();
    await LeaveBalanceHistoryService.logEventGrant({
      employeeId,
      leaveType,
      amount: grantDays,
      balanceBefore: before,
      performedBy: recordedBy || null,
      reason: `${eventType} on ${new Date(eventDate).toISOString().slice(0,10)} — granted ${grantDays} ${leaveType}`,
    }).catch(() => {});

    NotificationService.notify({
      title: "Leave Granted",
      message: `HR has granted ${grantDays} day(s) of ${leaveType} for the recorded ${eventType.toLowerCase()}.`,
      audienceType: "user",
      users: [employeeId],
      category: "approval",
      priority: "medium",
      module: "hr",
      actionUrl: "/dashboard/profile",
      actionLabel: "View Leave",
      createdBy: recordedBy,
    }).catch(() => {});

    return { event, balanceAfter: before + grantDays };
  }

  // --- Approved/Rejected/Cancelled history (filterable, paginated) ---
  // Used by both manager (?managerId=) and HR-wide listings.
  static async getLeaveHistory({ scope = "all", managerId, status, fromdate, todate, page, limit, search, leaveType } = {}) {
    const query = {};
    if (status) {
      query.status = status;
    } else {
      // History = anything that is no longer Pending
      query.status = { $in: ["Manager Approved", "HR Approved", "Rejected", "Cancelled", "Revoked"] };
    }
    if (leaveType) query.leaveType = leaveType;
    if (fromdate) {
      const fd = new Date(fromdate); fd.setUTCHours(0, 0, 0, 0);
      query.fromDate = { ...(query.fromDate || {}), $gte: fd };
    }
    if (todate) {
      const td = new Date(todate); td.setUTCHours(23, 59, 59, 999);
      query.toDate = { ...(query.toDate || {}), $lte: td };
    }

    if (scope === "team" && managerId) {
      const team = await EmployeeModel.find({ reportsTo: managerId }).select("_id");
      query.employeeId = { $in: team.map((t) => t._id) };
    }

    if (search) {
      const s = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matchingEmps = await EmployeeModel.find({
        $or: [{ name: { $regex: s, $options: "i" } }, { employeeId: { $regex: s, $options: "i" } }],
      }).select("_id").lean();
      const ids = matchingEmps.map((e) => e._id);
      query.employeeId = query.employeeId
        ? { $in: ids.filter((id) => query.employeeId.$in.some((x) => String(x) === String(id))) }
        : { $in: ids };
    }

    const pg  = Math.max(1, parseInt(page)  || 1);
    const lim = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pg - 1) * lim;

    const [data, total] = await Promise.all([
      LeaveRequestModel.find(query)
        .populate("employeeId", "name designation department photoUrl employeeId")
        .populate("finalApprovedBy", "name employeeId")
        .sort({ updatedAt: -1 })
        .skip(skip).limit(lim).lean(),
      LeaveRequestModel.countDocuments(query),
    ]);
    return { data, total, page: pg, limit: lim };
  }

  // --- 6. GET ALL LEAVES (HR view) ---
  // Returns Pending OR Manager-approved leaves across the entire company
  static async getAllPendingLeaves({ status, fromDate, toDate, fromdate, todate, page, limit, search } = {}) {
    const query = {};
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ["Pending", "Manager Approved"] };
    }
    const fd = fromDate || fromdate;
    const td = toDate   || todate;
    if (fd) query.fromDate = { $gte: new Date(fd) };
    if (td) query.toDate   = { $lte: new Date(td) };

    const pg   = Math.max(1, parseInt(page)  || 1);
    const lim  = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pg - 1) * lim;

    if (search) {
      const s = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matchingEmps = await EmployeeModel.find({
        $or: [
          { name:       { $regex: s, $options: "i" } },
          { employeeId: { $regex: s, $options: "i" } },
        ],
      }).select("_id").lean();
      query.employeeId = { $in: matchingEmps.map((e) => e._id) };
    }

    const [data, total] = await Promise.all([
      LeaveRequestModel.find(query)
        .populate("employeeId", "name designation department photoUrl")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      LeaveRequestModel.countDocuments(query),
    ]);
    return { data, total, page: pg, limit: lim };
  }
}

export default LeaveService;
