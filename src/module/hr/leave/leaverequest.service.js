import LeaveRequestModel from "./leaverequest.model.js";
import EmployeeModel from "../employee/employee.model.js";
import UserAttendanceModel from "../userAttendance/userAttendance.model.js";
import CalendarService from "../holidays/holiday.service.js";
import NotificationService from "../../notifications/notification.service.js";
import LeaveBalanceHistoryService from "./leaveBalanceHistory.service.js";

class LeaveService {
  // --- HELPER: Auto-Fill Attendance on Approval ---
  // This ensures the "Daily Dashboard" knows they are on leave weeks in advance.
  static async fillAttendanceForLeave(leaveRequest) {
    const leaveDates = [];
    let currentDate = new Date(leaveRequest.fromDate);
    const endDate = new Date(leaveRequest.toDate);

    while (currentDate <= endDate) {
      // 1. Check if it's a working day
      // We usually only mark "On Leave" for actual working days.
      const dayStatus = await CalendarService.checkDayStatus(currentDate);

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
    // 🛑 3. PERMISSION (SHORT LEAVE) QUOTA CHECK
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

      // Count approved permissions in this month
      const usedPermissions = await LeaveRequestModel.countDocuments({
        employeeId,
        requestType: "Short Leave",
        status: { $in: ["Manager Approved", "HR Approved", "Approved"] },
        fromDate: { $gte: startOfMonth, $lte: endOfMonth },
      });

      if (usedPermissions >= 3) {
        const monthName = start.toLocaleString("default", { month: "long" });
        throw {
          statusCode: 400,
          message: `Permission Limit Exceeded. You have already used ${usedPermissions}/3 permissions for ${monthName}.`,
        };
      }
    }

    // ---------------------------------------------------------
    // 🚀 4. CALCULATE DAYS & VALIDATE WORKING DAYS
    // ---------------------------------------------------------
    let calculatedDays = 0;
    let loopDate = new Date(start);
    const nonWorkingDaysEntry = [];

    while (loopDate <= end) {
      const dayStatus = await CalendarService.checkDayStatus(loopDate);

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
      loopDate.setDate(loopDate.getDate() + 1);
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
      status: "Pending",
      workflowLogs: [
        {
          action: "Applied",
          actionBy: employeeId,
          role: "Employee",
          remarks: reason,
        },
      ],
    });

    await newLeave.save();

    // Notify manager about new leave request
    if (employee.reportsTo) {
      NotificationService.notify({
        title: "New Leave Request",
        message: `${employee.name} has applied for ${leaveType} leave from ${start.toLocaleDateString("en-GB")} to ${end.toLocaleDateString("en-GB")}`,
        audienceType: "user",
        users: [employee.reportsTo],
        category: "approval",
        priority: "high",
        module: "hr",
        reference: { model: "LeaveRequest", documentId: newLeave._id },
        actionUrl: `/dashboard/profile`,
        actionLabel: "Review Request",
        createdBy: employeeId,
      });
    }

    return newLeave;
  }

  // --- 2. ACTION LEAVE (Approve/Reject) ---
  static async actionLeave(data) {
    const { leaveRequestId, actionBy, role, action, remarks } = data;

    const leaveRequest = await LeaveRequestModel.findById(leaveRequestId);
    if (!leaveRequest) throw { statusCode: 404, message: "Request not found." };

    // State machine guard
    if (action === "Approve") {
      if (role === "Manager" && leaveRequest.status !== "Pending") {
        throw { statusCode: 400, message: `Cannot approve: request is already ${leaveRequest.status}` };
      }
      if (role === "HR" && leaveRequest.status !== "Manager Approved") {
        throw { statusCode: 400, message: `HR can only approve Manager-approved requests. Current status: ${leaveRequest.status}` };
      }
    }
    if (action === "Reject" && ["Rejected", "Cancelled", "HR Approved"].includes(leaveRequest.status)) {
      throw { statusCode: 400, message: `Request is already ${leaveRequest.status}` };
    }

    if (action === "Approve") {
      const employee = await EmployeeModel.findById(leaveRequest.employeeId);
      if (!employee) throw { statusCode: 404, message: "Employee not found." };

      // ---------------------------------------------------------
      // SCENARIO A: COMPENSATORY OFF (Complex Array Logic)
      // ---------------------------------------------------------
      if (leaveRequest.leaveType === "CompOff") {
        const now = new Date();
        let daysToDeduct = leaveRequest.totalDays;

        // 1. Filter valid credits (Not Used AND Not Expired)
        // 2. Sort by Expiry Date ASC (Use the ones expiring soonest first - FIFO)
        // We modify the original array in place, so we need indices or references

        // Find indices of valid credits
        const validIndices = employee.leaveBalance.compOff
          .map((credit, index) => ({ credit, index })) // Keep track of original index
          .filter(
            (item) =>
              !item.credit.isUsed && new Date(item.credit.expiryDate) > now,
          )
          .sort(
            (a, b) =>
              new Date(a.credit.expiryDate) - new Date(b.credit.expiryDate),
          ); // Oldest expiry first

        // Check if we have enough credits
        if (validIndices.length < daysToDeduct) {
          throw {
            statusCode: 400,
            message: `Cannot Approve. Insufficient valid Comp Offs. Available: ${validIndices.length}, Required: ${daysToDeduct}`,
          };
        }

        // Mark them as USED
        for (let i = 0; i < daysToDeduct; i++) {
          const originalIndex = validIndices[i].index;
          employee.leaveBalance.compOff[originalIndex].isUsed = true;
        }

        await employee.save();

        // Log CompOff debit (array credits, so balanceBefore = validIndices.length)
        await LeaveBalanceHistoryService.logDebit({
          employeeId:    leaveRequest.employeeId,
          leaveType:     "CompOff",
          amount:        daysToDeduct,
          balanceBefore: validIndices.length,
          leaveRequestId: leaveRequest._id,
          performedBy:   actionBy,
          reason: `CompOff Approved (${role}) — ${leaveRequest.fromDate.toISOString().split("T")[0]} to ${leaveRequest.toDate.toISOString().split("T")[0]}`,
        });
      }

      // ---------------------------------------------------------
      // SCENARIO B: BALANCE-TRACKED LEAVES (CL, SL, PL, Maternity, Paternity, Bereavement)
      // ---------------------------------------------------------
      else if (["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement"].includes(leaveRequest.leaveType)) {
        const available = employee.leaveBalance[leaveRequest.leaveType] ?? 0;
        if (available < leaveRequest.totalDays) {
          throw {
            statusCode: 400,
            message: `Cannot Approve. Insufficient ${leaveRequest.leaveType} balance. Available: ${available}, Required: ${leaveRequest.totalDays}`,
          };
        }
        employee.leaveBalance[leaveRequest.leaveType] -= leaveRequest.totalDays;
        await employee.save();

        // Log balance debit
        await LeaveBalanceHistoryService.logDebit({
          employeeId:    leaveRequest.employeeId,
          leaveType:     leaveRequest.leaveType,
          amount:        leaveRequest.totalDays,
          balanceBefore: available,
          leaveRequestId: leaveRequest._id,
          performedBy:   actionBy,
          reason: `Leave Approved (${role}) — ${leaveRequest.fromDate.toISOString().split("T")[0]} to ${leaveRequest.toDate.toISOString().split("T")[0]}`,
        });
      }
      // LWP and Permission — no balance to deduct

      // 3. Auto-Sync Attendance
      await this.fillAttendanceForLeave(leaveRequest);

      // 4. Update Status based on approver role:
      //    Manager → "Manager Approved" (awaiting HR sign-off)
      //    HR      → "HR Approved"      (fully approved)
      if (role === "HR") {
        leaveRequest.status = "HR Approved";
        leaveRequest.finalApprovedBy = actionBy;
        leaveRequest.finalApprovalDate = new Date();
      } else {
        leaveRequest.status = "Manager Approved";
      }
    } else if (action === "Reject") {
      leaveRequest.status = "Rejected";
      leaveRequest.rejectionReason = remarks;
    }

    leaveRequest.workflowLogs.push({
      action: action === "Approve" ? "Approved" : "Rejected",
      actionBy: actionBy,
      role: role,
      remarks: remarks,
    });

    await leaveRequest.save();

    // Notify employee about leave decision
    NotificationService.notify({
      title: action === "Approve" ? "Leave Approved" : "Leave Rejected",
      message: action === "Approve"
        ? `Your ${leaveRequest.leaveType} leave from ${new Date(leaveRequest.fromDate).toLocaleDateString("en-GB")} to ${new Date(leaveRequest.toDate).toLocaleDateString("en-GB")} has been approved.`
        : `Your ${leaveRequest.leaveType} leave request has been rejected.${remarks ? " Reason: " + remarks : ""}`,
      audienceType: "user",
      users: [leaveRequest.employeeId],
      category: action === "Approve" ? "approval" : "alert",
      priority: action === "Approve" ? "medium" : "high",
      module: "hr",
      reference: { model: "LeaveRequest", documentId: leaveRequest._id },
      actionUrl: `/dashboard/profile`,
      actionLabel: "View Leave",
      createdBy: actionBy,
    });

    return leaveRequest;
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

    // A. Refund balance if leave was already approved (Manager or HR)
    if (
      ["Manager Approved", "HR Approved"].includes(leaveRequest.status) &&
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

  // --- 5. GET PENDING APPROVALS (Manager view) ---
  static async getPendingLeavesForManager(managerId) {
    const team = await EmployeeModel.find({ reportsTo: managerId }).select("_id");
    const teamIds = team.map((t) => t._id);

    return await LeaveRequestModel.find({
      employeeId: { $in: teamIds },
      status: "Pending",
    })
      .populate("employeeId", "name designation photoUrl leaveBalance")
      .sort({ fromDate: 1 });
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
