import LeaveRequestModel from "./leaverequest.model.js";
import EmployeeModel from "../employee/employee.model.js";
import UserAttendanceModel from "../userAttendance/userAttendance.model.js";
import CalendarService from "../holidays/holiday.service.js";

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
    // Delete the "On Leave" records for this range.
    // Safety Check: We ONLY delete records that don't have a check-in time.
    // This prevents deleting a record where they came to work despite being on leave.
    await UserAttendanceModel.deleteMany({
      employeeId: leaveRequest.employeeId,
      date: { $gte: leaveRequest.fromDate, $lte: leaveRequest.toDate },
      status: "On Leave",
      "checkIn.time": { $exists: false },
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

    if (requestType !== "Short Leave") {
      const currentBalance = employee.leaveBalance[leaveType] || 0;
      if (leaveType !== "LWP" && currentBalance < calculatedDays) {
        throw {
          statusCode: 400,
          message: `Insufficient ${leaveType} balance. Need: ${calculatedDays}, Available: ${currentBalance}`,
        };
      }
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
    return newLeave;
  }

  // --- 2. ACTION LEAVE (Approve/Reject) ---
  static async actionLeave(data) {
    const { leaveRequestId, actionBy, role, action, remarks } = data;

    const leaveRequest = await LeaveRequestModel.findById(leaveRequestId);
    if (!leaveRequest) throw { statusCode: 404, message: "Request not found." };

    // Prevent re-approving
    if (
      ["Approved", "Rejected", "Cancelled", "HR Approved","Manager Approved"].includes(
        leaveRequest.status,
      )
    ) {
      throw {
        statusCode: 400,
        message: `Request is already ${leaveRequest.status}`,
      };
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
          // Update the specific credit in the main array
          employee.leaveBalance.compOff[originalIndex].isUsed = true;
        }

        // Save the updates to the array
        await employee.save();
      }

      // ---------------------------------------------------------
      // SCENARIO B: STANDARD LEAVES (CL, SL, PL - Simple Number)
      // ---------------------------------------------------------
      else if (
        leaveRequest.leaveType !== "LWP" &&
        leaveRequest.leaveType !== "Permission"
      ) {
        if (
          employee.leaveBalance[leaveRequest.leaveType] < leaveRequest.totalDays
        ) {
          throw {
            statusCode: 400,
            message: `Cannot Approve. Insufficient balance.`,
          };
        }

        employee.leaveBalance[leaveRequest.leaveType] -= leaveRequest.totalDays;
        await employee.save();
      }

      // 3. Auto-Sync Attendance
      await this.fillAttendanceForLeave(leaveRequest);

      // 4. Update Status (If HR role involved, might go to "HR Approved", else "Approved")
      // Assuming Manager Approval is final for now based on your flow:
      leaveRequest.status = "Manager Approved";
      leaveRequest.finalApprovedBy = actionBy;
      leaveRequest.finalApprovalDate = new Date();
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

    // A. Refund Balance (If it was approved and not LWP)
    if (
      leaveRequest.status === "Approved" &&
      leaveRequest.leaveType !== "LWP"
    ) {
      await EmployeeModel.findByIdAndUpdate(leaveRequest.employeeId, {
        $inc: {
          [`leaveBalance.${leaveRequest.leaveType}`]: leaveRequest.totalDays,
        },
      });

      // B. [FIX] Clear Attendance Records
      // await this.clearAttendanceForLeave(leaveRequest);
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

  // --- 5. GET PENDING APPROVALS ---
  static async getPendingLeavesForManager(managerId) {
    const team = await EmployeeModel.find({ reportsTo: managerId }).select(
      "_id",
    );
    const teamIds = team.map((t) => t._id);

    return await LeaveRequestModel.find({
      employeeId: { $in: teamIds },
      status: "Pending",
    })
      .populate("employeeId", "name designation photoUrl leaveBalance")
      .sort({ fromDate: 1 });
  }
}

export default LeaveService;
