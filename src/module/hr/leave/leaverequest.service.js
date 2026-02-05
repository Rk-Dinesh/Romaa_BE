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
            filter: { employeeId: leaveRequest.employeeId, date: new Date(currentDate) },
            // UPSERT: Create if new, Update if exists.
            // IMPORTANT: We use $set to overwrite status to 'On Leave'
            update: { 
              $set: { 
                status: "On Leave",
                remarks: `Approved Leave: ${leaveRequest.leaveType} - ${leaveRequest.reason}`,
                // We don't overwrite checkIn data if they accidentally came to work
              }
            },
            upsert: true
          }
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
      "checkIn.time": { $exists: false } 
    });
  }

  // --- 1. APPLY FOR LEAVE ---
static async applyLeave(data) {
    let { 
      employeeId, leaveType, requestType, fromDate, toDate, 
      reason, shortLeaveTime, coveringEmployeeId 
    } = data;

    // A. Validate Dates
    const start = new Date(fromDate);
    const end = new Date(toDate);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(0, 0, 0, 0);

    if (start > end) throw { statusCode: 400, message: "End date cannot be before start date." };

    // Helper for formatting dates in error messages
    const dateStr = (d) => new Date(d).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' }); 

    // ---------------------------------------------------------
    // 🚀 B. STRICT DATE VALIDATION (Reject if Holiday included)
    // ---------------------------------------------------------
    let calculatedDays = 0;
    let loopDate = new Date(start);
    
    // Array to collect any non-working days found in the range
    const invalidDates = []; 

    while (loopDate <= end) {
      const dayStatus = await CalendarService.checkDayStatus(loopDate);

      if (!dayStatus.isWorkingDay) {
        // 🛑 FOUND A HOLIDAY/WEEKEND!
        // Add specific detail to the error list
        invalidDates.push(`${dateStr(loopDate)} is ${dayStatus.reason}`);
      } else {
        // It's a working day, calculate count as usual
        if (requestType === "First Half" || requestType === "Second Half") {
          calculatedDays += 0.5;
        } else {
          calculatedDays += 1;
        }
      }

      loopDate.setDate(loopDate.getDate() + 1);
    }

    // 🚨 THROW ERROR if any invalid dates were found
    if (invalidDates.length > 0) {
      throw { 
        statusCode: 400, 
        message: `Request Rejected. Your selection includes non-working days: ${invalidDates.join(", ")}. Please apply for working days only.` 
      };
    }

    // Safety check (shouldn't trigger if invalidDates check passes, but good to have)
    if (calculatedDays === 0) {
      throw { statusCode: 400, message: "Invalid selection. No working days found." };
    }

    // ---------------------------------------------------------

    // C. Check Leave Balance
    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) throw { statusCode: 404, message: "Employee not found." };

    const currentBalance = employee.leaveBalance[leaveType]; 
    if (leaveType !== "LWP" && currentBalance < calculatedDays) {
      throw { statusCode: 400, message: `Insufficient ${leaveType} balance. Need: ${calculatedDays}, Available: ${currentBalance}` };
    }

    // D. Check for Overlapping Requests
    const overlap = await LeaveRequestModel.findOne({
      employeeId,
      status: { $in: ["Pending", "Manager Approved", "HR Approved", "Approved"] }, 
      $or: [
        { fromDate: { $lte: end }, toDate: { $gte: start } }
      ]
    });

    if (overlap) {
      const conflictStart = new Date(overlap.fromDate).toLocaleDateString("en-GB");
      const conflictEnd = new Date(overlap.toDate).toLocaleDateString("en-GB");
      throw { 
        statusCode: 409, 
        message: `Overlap: You already have a request from ${conflictStart} to ${conflictEnd}.` 
      };
    }

    // E. Create Request
    const newLeave = new LeaveRequestModel({
      employeeId,
      leaveType,
      requestType,
      fromDate: start,
      toDate: end,
      totalDays: calculatedDays,
      reason,
      shortLeaveTime,
      coveringEmployeeId,
      status: "Pending",
      workflowLogs: [{
        action: "Applied",
        actionBy: employeeId,
        role: "Employee",
        remarks: reason
      }]
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
    if (leaveRequest.status === "Approved" || leaveRequest.status === "Rejected" || leaveRequest.status === "Cancelled") {
        throw { statusCode: 400, message: `Request is already ${leaveRequest.status}` };
    }

    if (action === "Approve") {
      // 1. Re-Check Balance & Deduct
      if (leaveRequest.leaveType !== "LWP") {
        const employee = await EmployeeModel.findById(leaveRequest.employeeId);
        if (employee.leaveBalance[leaveRequest.leaveType] < leaveRequest.totalDays) {
           throw { statusCode: 400, message: `Cannot Approve. Insufficient balance.` };
        }
        
        employee.leaveBalance[leaveRequest.leaveType] -= leaveRequest.totalDays;
        await employee.save();
      }

      // 2. [FIX] Auto-Sync Attendance (The Edge Case Fix)
      await this.fillAttendanceForLeave(leaveRequest);

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
      remarks: remarks
    });

    await leaveRequest.save();
    return leaveRequest;
  }

  // --- 3. CANCEL LEAVE (The Edge Case Fix) ---
  static async cancelLeave(data) {
    const { leaveRequestId, cancelledBy } = data;
    const leaveRequest = await LeaveRequestModel.findById(leaveRequestId);

    if (!leaveRequest) throw { statusCode: 404, message: "Request not found" };
    if (leaveRequest.status === "Cancelled" || leaveRequest.status === "Rejected") {
        throw { statusCode: 400, message: "Request is already inactive" };
    }

    // A. Refund Balance (If it was approved and not LWP)
    if (leaveRequest.status === "Approved" && leaveRequest.leaveType !== "LWP") {
      await EmployeeModel.findByIdAndUpdate(leaveRequest.employeeId, {
        $inc: { [`leaveBalance.${leaveRequest.leaveType}`]: leaveRequest.totalDays }
      });

      // B. [FIX] Clear Attendance Records
      await this.clearAttendanceForLeave(leaveRequest);
    }

    leaveRequest.status = "Cancelled";
    leaveRequest.isCancelled = true;
    leaveRequest.cancelledAt = new Date();
    leaveRequest.workflowLogs.push({ action: "Cancelled", actionBy: cancelledBy, role: "User/HR" });
    
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
    const team = await EmployeeModel.find({ reportsTo: managerId }).select("_id");
    const teamIds = team.map(t => t._id);

    return await LeaveRequestModel.find({
      employeeId: { $in: teamIds },
      status: "Pending"
    })
    .populate("employeeId", "name designation photoUrl leaveBalance") 
    .sort({ fromDate: 1 });
  }
}

export default LeaveService;