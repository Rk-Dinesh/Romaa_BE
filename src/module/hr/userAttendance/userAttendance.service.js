import { getDistanceFromLatLonInMeters } from "../../../../utils/geofunction.js";
import CalendarService from "../holidays/holiday.service.js";
import LeaveRequestModel from "../leave/leaverequest.model.js";
import UserAttendanceModel from "./userAttendance.model.js";
import { SHIFT_RULES } from "../../../../utils/shiftRules.js";
import EmployeeModel from "../employee/employee.model.js";

class AttendanceService {
  // --- HELPER: Parse HH:mm to Date Object ---
  static getTimeOnDate(baseDate, timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  // --- HELPER: Format Date/Time to IST String (for Schema String fields) ---
  static formatToISTString(date) {
    if (!date) return null;
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false, // keeping 24h format for internal consistency
    });
  }

  static getISTWallTime(date) {
    if (!date) return null;
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 Hours 30 Mins in MS
    return new Date(date.getTime() + istOffset);
  }

  static async performPunch(data) {
    const {
      employeeId,
      punchType = "In",
      latitude,
      longitude,
      siteLatitude,
      siteLongitude,
      address,
      photoUrl,
      attendanceType = "Office",
      shiftType = "General",
      deviceId,
      deviceModel,
      ipAddress,
      geofenceId,
      geofenceSiteId,
      remarks,
      testDate, // Optional: For testing
    } = data;

    // 1. Time Setup
    const now = testDate ? new Date(testDate) : new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0); // Normalized Midnight UTC

    // 2. Prepare IST Time for storage
    const nowIST = AttendanceService.getISTWallTime(now);

    // ---------------------------------------------------------
    // 1. FETCH OR CREATE RECORD
    // ---------------------------------------------------------
    let attendance = await UserAttendanceModel.findOne({
      employeeId,
      date: today,
    });

    // --- A. VALIDATION CHECKS ---
    if (!attendance) {
      if (punchType !== "In") {
        throw {
          statusCode: 400,
          message: "No attendance record found. You must Check-In first.",
        };
      }
    } else {
      const timeline = attendance.timeline;
      const lastPunchType = timeline[timeline.length - 1].punchType;

      // Helper: Count occurrences of punch types
      const punchCounts = timeline.reduce((acc, t) => {
        acc[t.punchType] = (acc[t.punchType] || 0) + 1;
        return acc;
      }, {});

      // B. Terminal State: If 'Out' exists, no more actions allowed
      if (punchCounts["Out"] > 0) {
        throw {
          statusCode: 400,
          message: "You have already checked out for the day.",
        };
      }

      // C. Daily Limits & Single-Entry Rules
      if (punchType === "In") {
        throw { statusCode: 400, message: "You are already checked in." };
      }
      if (punchType === "LunchStart" && punchCounts["LunchStart"] >= 1) {
        throw {
          statusCode: 400,
          message: "Limit Exceeded: Lunch break already taken.",
        };
      }
      if (punchType === "BreakStart" && punchCounts["BreakStart"] >= 2) {
        throw {
          statusCode: 400,
          message: "Limit Exceeded: Max 2 breaks allowed.",
        };
      }

      // D. State-Based Flow (Sequential Logic)

      // 1. Forced Completion: If on Lunch, must end Lunch. If on Break, must end Break.
      if (lastPunchType === "LunchStart" && punchType !== "LunchEnd") {
        throw {
          statusCode: 400,
          message: "Action blocked: You must end your Lunch break first.",
        };
      }
      if (lastPunchType === "BreakStart" && punchType !== "BreakEnd") {
        throw {
          statusCode: 400,
          message: "Action blocked: You must end your Break first.",
        };
      }

      // 2. Reverse Prevention: Cannot end what hasn't started
      if (punchType === "LunchEnd" && lastPunchType !== "LunchStart") {
        throw {
          statusCode: 400,
          message: "Invalid Action: No active Lunch session to end.",
        };
      }
      if (punchType === "BreakEnd" && lastPunchType !== "BreakStart") {
        throw {
          statusCode: 400,
          message: "Invalid Action: No active Break session to end.",
        };
      }
    }

    // ---------------------------------------------------------
    // 2. LOCATION VALIDATION
    // ---------------------------------------------------------
    let distance = 0;
    let verificationMethod = "Manual";
    if (attendanceType === "Office" || attendanceType === "Site") {
      if (siteLatitude && siteLongitude) {
        distance = getDistanceFromLatLonInMeters(
          latitude,
          longitude,
          siteLatitude,
          siteLongitude,
        );
        if (distance > 1000)
          throw {
            statusCode: 403,
            message: `Location mismatch. ${Math.round(distance)}m away.`,
          };
        verificationMethod = "Geofence";
      }
    }

    // ---------------------------------------------------------
    // 3. INITIALIZE NEW RECORD (First Check-In Logic)
    // ---------------------------------------------------------
    if (!attendance) {
      const rule = SHIFT_RULES[shiftType] || SHIFT_RULES["General"];
      const dayStatus = await CalendarService.checkDayStatus(today);
      const isHolidayWork = !dayStatus.isWorkingDay;

      let initialStatus = "Present";
      let systemRemarks = "";
      let isLate = false;

      // Check Leave
      const approvedLeave = await LeaveRequestModel.findOne({
        employeeId: employeeId,
        status: { $in: ["Manager Approved", "HR Approved"] },
        fromDate: { $lte: today },
        toDate: { $gte: today },
        isCancelled: false
      });

      if (approvedLeave) {
            // Case 1: Permission (Short Leave)
            if (approvedLeave.leaveType === "Permission" || approvedLeave.requestType === "Short Leave") {
                if (approvedLeave.shortLeaveTime && approvedLeave.shortLeaveTime.from && approvedLeave.shortLeaveTime.to) {
                    isPermissionActive = true;
                    
                    // Calculate Permission Duration (e.g., 10:00 to 13:00 = 180 mins)
                    const [startH, startM] = approvedLeave.shortLeaveTime.from.split(':').map(Number);
                    const [endH, endM] = approvedLeave.shortLeaveTime.to.split(':').map(Number);
                    
                    // Convert both to minutes from midnight
                    const startMins = (startH * 60) + startM;
                    const endMins = (endH * 60) + endM;
                    
                    permissionDurationMins = endMins - startMins;

                    systemRemarks = `On Permission (${approvedLeave.shortLeaveTime.from} - ${approvedLeave.shortLeaveTime.to})`;
                }
            }else if (approvedLeave.requestType === "Full Day") {
                initialStatus = "Absent";
                systemRemarks = `Work on Approved Leave (${approvedLeave.leaveType})`;
            }else if (approvedLeave.requestType.includes("Half")) {
                systemRemarks = `Half Day Leave (${approvedLeave.requestType})`;
                // Half day logic implies they might arrive late (2nd Half) or leave early (1st Half)
            }
        }

      // Check Late
      if (!isHolidayWork) {
        const shiftStart = AttendanceService.getTimeOnDate(now, rule.startTime);
        let lateThreshold = new Date(shiftStart.getTime() + rule.gracePeriodMins * 60000);

        if (isPermissionActive && approvedLeave.shortLeaveTime) {
                const [endH, endM] = approvedLeave.shortLeaveTime.to.split(':').map(Number);
                const permissionEnd = new Date(now);
                permissionEnd.setHours(endH, endM, 0, 0);

                // If Permission ends AFTER the grace period, that becomes the new "On Time" limit
                if (permissionEnd > lateThreshold) {
                    lateThreshold = permissionEnd;
                }
            }

        if (now > lateThreshold) {
          isLate = true;
          const startOfMonth = new Date(
            today.getFullYear(),
            today.getMonth(),
            1,
          );
          const lateCount = await UserAttendanceModel.countDocuments({
            employeeId,
            date: { $gte: startOfMonth, $lt: today },
            "flags.isLateEntry": true,
          });
          initialStatus = isPermissionActive ? "Present" : "Absent";
          systemRemarks = systemRemarks
            ? `${systemRemarks} | Late Entry #${lateCount + 1}`
            : `Late Entry #${lateCount + 1}`;
        }
      }

      if (isHolidayWork) {
        initialStatus = "Holiday";
        systemRemarks = "Holiday Work";
      }

      attendance = new UserAttendanceModel({
        employeeId,
        date: today,
        istDate: nowIST, // ✅ Storing 09:00:00 here

        shiftConfig: {
          ...rule,
          shiftType: rule.type,
          istStartTime: rule.startTime,
          istEndTime: rule.endTime,
        },

        firstIn: now,
        istFirstIn: nowIST, // ✅ Storing 09:00:00 here

        status: initialStatus,
        workType: isHolidayWork ? "Holiday Work" : "Regular",
        attendanceType,
       flags: { 
                isLateEntry: isLate,
                isPermission: isPermissionActive 
            },
        permissionDurationMins: permissionDurationMins,
        remarks: systemRemarks,
        timeline: [],
        sessions: [],
      });
    }

    // ---------------------------------------------------------
    // 4. SESSION MANAGEMENT
    // ---------------------------------------------------------
    const openSession = attendance.sessions.find((s) => !s.endTime);
    if (openSession) {
      openSession.endTime = now;
      openSession.istEndTime = nowIST; // ✅ IST
      openSession.durationMins = Math.round(
        (now - new Date(openSession.startTime)) / 60000,
      );
    }

    let newSession = null;
    const sessionBase = { startTime: now, istStartTime: nowIST }; // ✅ IST

    if (["In", "BreakEnd", "LunchEnd"].includes(punchType)) {
      newSession = { ...sessionBase, type: "Work", isBillable: true };
    } else if (punchType === "LunchStart") {
      newSession = { ...sessionBase, type: "Lunch", isBillable: false };
    } else if (punchType === "BreakStart") {
      newSession = { ...sessionBase, type: "Break", isBillable: false };
    }

    if (newSession) attendance.sessions.push(newSession);

    // ---------------------------------------------------------
    // 5. TIMELINE UPDATE
    // ---------------------------------------------------------
    const timelineEntry = {
      punchType,
      timestamp: now,
      istTimestamp: nowIST, // ✅ Storing 09:00:00 here
      location: {
        lat: latitude,
        lng: longitude,
        address,
        distanceFromSite: distance,
        isMock: false,
      },
      device: { deviceId, model: deviceModel, ip: ipAddress },
      verification: { method: verificationMethod, photoUrl },
      remarks: remarks,
    };

    if (attendanceType === "Office") timelineEntry.geofenceId = geofenceId;
    else if (attendanceType === "Site")
      timelineEntry.geofenceSiteId = geofenceSiteId;

    attendance.timeline.push(timelineEntry);

    // ---------------------------------------------------------
    // 6. CALCULATE SUMMARIES
    // ---------------------------------------------------------
    if (["Out", "BreakStart", "LunchStart"].includes(punchType)) {
      attendance.lastOut = now;
      attendance.istLastOut = nowIST; // ✅ IST
    }

    if (attendance.firstIn && attendance.lastOut) {
      attendance.totalDuration = Math.round(
        (attendance.lastOut - attendance.firstIn) / 60000,
      );
    }

    const workSessions = attendance.sessions.filter(
      (s) => s.type === "Work" && s.endTime,
    );
    const totalWorkMins = workSessions.reduce(
      (acc, s) => acc + (s.durationMins || 0),
      0,
    );
    attendance.netWorkHours = parseFloat((totalWorkMins / 60).toFixed(2));

    const breakSessions = attendance.sessions.filter(
      (s) => (s.type === "Break" || s.type === "Lunch") && s.endTime,
    );
    attendance.totalBreakTime = breakSessions.reduce(
      (acc, s) => acc + (s.durationMins || 0),
      0,
    );

    // ---------------------------------------------------------
    // 7. FLAGS (Early Exit)
    // ---------------------------------------------------------
    if (punchType === "Out") {
      const shiftEnd = AttendanceService.getTimeOnDate(
        now,
        attendance.shiftConfig.endTime,
      );
      if (shiftEnd && now < shiftEnd) attendance.flags.isEarlyExit = true;
    }

    // ---------------------------------------------------------
    // 8. HOLIDAY COMP-OFF
    // ---------------------------------------------------------
    if (attendance.workType === "Holiday Work") {
      if (attendance.netWorkHours >= 8) {
        attendance.rewards.isCompOffEligible = true;
        attendance.rewards.compOffCredit += 1;
        attendance.rewards.approvalStatus = "Auto-Approved";
      } else if (attendance.netWorkHours >= 4) {
        attendance.rewards.isCompOffEligible = true;
        attendance.rewards.compOffCredit += 0.5;
        attendance.rewards.approvalStatus = "Auto-Approved";
      } else {
        attendance.rewards.isCompOffEligible = false;
        attendance.rewards.compOffCredit += 0;
        attendance.rewards.approvalStatus = "Rejected";
      }
    }

    // ---------------------------------------------------------
    // 9. FINAL STATUS UPDATE (On Checkout)
    // ---------------------------------------------------------
    if (punchType === "Out" && attendance.workType !== "Holiday Work") {
      const activeLeave = await LeaveRequestModel.findOne({
        employeeId: employeeId,
        status: { $in: ["Manager Approved", "HR Approved"] },
        fromDate: { $lte: today },
        toDate: { $gte: today },
      });

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lateCount = await UserAttendanceModel.countDocuments({
        employeeId,
        date: { $gte: startOfMonth, $lt: today },
        "flags.isLateEntry": true,
        isCancelled: false,
      });

      const isPermission = attendance.flags.isPermission || (activeLeave && activeLeave.leaveType === "Permission");

      let effectiveHours = attendance.netWorkHours;
        
      if (isPermission && attendance.permissionDurationMins > 0) {
          const permissionHours = attendance.permissionDurationMins / 60;
          effectiveHours += permissionHours;
      }

      const isLate = attendance.flags.isLateEntry;
      const isLeave = !!activeLeave;
      const currentLateCount = isLate ? lateCount + 1 : lateCount;

      if (isLeave && !isPermission) {
        attendance.status = "Absent";
        attendance.remarks = `Work on Approved Leave (${activeLeave.leaveType}) | Regularization Required`;
      } else if (isLate && !isPermission) {
        if (currentLateCount > 3) {
          attendance.status = "Half-Day";
          attendance.remarks = `Late Penalty (${currentLateCount}th Late) | Worked: ${attendance.netWorkHours} hrs`;
          attendance.payroll.penalty = {
            isApplied: true,
            type: "Late Deduction",
            deductionAmount: 0.5,
          };
        } else {
          attendance.status = "Absent";
          attendance.remarks = `Late Entry #${currentLateCount} | HR Regularization Required`;
        }
      } else {
        if (effectiveHours >= 7) {
          attendance.status = "Present";
          attendance.remarks = "Shift Completed";
        } else if (effectiveHours >= 4) {
          attendance.status = "Half-Day";
          attendance.remarks = "Short Duration (Half Day)";
        } else {
          attendance.status = "Absent";
          attendance.remarks = "Insufficient Hours (< 4 hrs)";
        }
      }
    }

    await attendance.save();

    return {
      success: true,
      message: `Punch ${punchType} successful`,
      data: {
        punchType,
        time: now,
        istTime: nowIST, // Return the Wall Time for frontend display if needed
        netWorkHours: attendance.netWorkHours,
        status: attendance.status,
      },
    };
  }

static async applyRegularization(employeeId, data) {
    const { 
      date, 
      category, // Enum: "Late Entry", "Missed Punch", "Work on Leave", "System Error"
      reason, 
      correctedInTime, // Optional (for Missed Punch)
      correctedOutTime // Optional
    } = data;

    const targetDate = new Date(date);
    targetDate.setUTCHours(0,0,0,0);

    const attendance = await UserAttendanceModel.findOne({ employeeId, date: targetDate });
    
    if (!attendance) throw { statusCode: 404, message: "No attendance record found for this date." };
    if (attendance.regularization.isApplied && attendance.regularization.status === "Pending") {
      throw { statusCode: 400, message: "Request already pending." };
    }

    // Backup current state
    const backup = {
      status: attendance.status,
      in: attendance.firstIn,
      out: attendance.lastOut,
      penalty: attendance.payroll.penalty
    };

    // Update Record
    attendance.regularization = {
      isApplied: true,
      status: "Pending",
      reasonCategory: category,
      userReason: reason,
      originalData: backup,
      correctedAt: new Date(),
      // Store proposed times temporarily in remarks or a generic field if schema is strict
      // Ideally schema should have: proposedInTime: Date, proposedOutTime: Date
    };

    // Specific Handling Logic (Stored in Reason for Manager Context)
    if (category === "Late Entry") {
       attendance.regularization.userReason = `[Late Penalty Waiver] ${reason}`;
    } else if (category === "Work on Leave") {
       attendance.regularization.userReason = `[Work on Leave Correction] ${reason}`;
    } else if (category === "Missed Punch") {
       attendance.regularization.userReason = `[Missed Punch] In: ${correctedInTime}, Out: ${correctedOutTime} | ${reason}`;
    }

    await attendance.save();
    return { success: true, message: "Regularization request submitted." };
  }

// Action on Regularization
static async actionRegularization(adminId, data) {
  const { employeeId, date, action, managerRemarks } = data; 
  const targetDate = new Date(date);
  targetDate.setUTCHours(0, 0, 0, 0);

  const attendance = await UserAttendanceModel.findOne({ employeeId, date: targetDate });
  if (!attendance) throw { statusCode: 404, message: "Record not found." };

  // REJECT FLOW
  if (action === "Rejected") {
    attendance.regularization.status = "Rejected";
    attendance.regularization.managerReason = managerRemarks;
    await attendance.save();
    return { success: true, message: "Request Rejected." };
  }

  // APPROVE FLOW
  if (action === "Approved") {
    const category = attendance.regularization.reasonCategory;

    // A. LATE ENTRY (Standard Logic)
    if (category === "Late Entry") {
      attendance.status = "Present";
      attendance.flags.isLateEntry = false;
      attendance.payroll.penalty = { isApplied: false, deductionAmount: 0 };
      attendance.remarks += " | Late Entry Regularized";
    }

    // =========================================================
    // B. WORK ON LEAVE (Updated Logic)
    // =========================================================
    else if (category === "Work on Leave") {
      attendance.status = "Present";
      
      // 1. Find the specific Leave Request active on this date
      const leaveRequest = await LeaveRequestModel.findOne({
        employeeId: employeeId,
        status: { $in: ["Manager Approved", "HR Approved"] }, // Only look for approved leaves
        fromDate: { $lte: targetDate },
        toDate: { $gte: targetDate }
      });

      if (leaveRequest) {
        const typeToCredit = leaveRequest.leaveType; // e.g., "CL", "SL", "PL"
        
        // Calculate days to refund (Handle half-day requests correctly)
        // If it spans multiple days, we only refund 1 day for this specific attendance regularization
        // However, usually "Work on Leave" implies the whole request is void for this day.
        // Safe bet: Default to 1 for Full Day, 0.5 for Half Day.
        let creditAmount = 1; 
        if (leaveRequest.requestType.includes("Half") || leaveRequest.totalDays === 0.5) {
          creditAmount = 0.5;
        }

        // 2. Increment the Leave Balance in Employee Model
        // Assuming EmployeeModel has `leaveBalance` object: { CL: 10, SL: 5, ... }
        const updateQuery = {};
        updateQuery[`leaveBalance.${typeToCredit}`] = creditAmount;

        await EmployeeModel.findByIdAndUpdate(employeeId, { 
          $inc: updateQuery 
        });

        // 3. Delete the Leave Request (Since they worked, the leave is void)
        // Note: If a leave request spans 3 days (Mon-Wed) and they work on Tuesday, 
        // deleting the whole request might be wrong. 
        // Ideally, we split the leave, but for simplicity/standard use cases:
        await LeaveRequestModel.findByIdAndDelete(leaveRequest._id);

        attendance.remarks += ` | Worked on Leave (Request Deleted, ${creditAmount} ${typeToCredit} Re-credited)`;
      } else {
        attendance.remarks += " | Worked on Leave (No active leave found to refund)";
      }
    }

    // C. MISSED PUNCH (Standard Logic)
    else if (category === "Missed Punch") {
      attendance.status = "Present";
      attendance.netWorkHours = 9; 
      attendance.remarks += " | Punch Regularized";
    }

    // Common Final Updates
    attendance.regularization.status = "Approved";
    attendance.regularization.correctedBy = adminId;
    attendance.regularization.managerReason = managerRemarks;
    attendance.regularization.correctedAt = new Date();

    await attendance.save();
    return { success: true, message: "Regularization Approved & Balances Updated." };
  }
}

  // GET SINGLE EMPLOYEE (Smart Data for Calendar)
  static async getEmployeeMonthlyStats(employeeId, month, year) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0)); // Last day of month

    const records = await UserAttendanceModel.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate }
    }).select("date status firstIn lastOut netWorkHours flags regularization permissionDurationMins");

    // Transform for Frontend (Calendar View)
    const calendarData = records.map(r => ({
      date: r.date.toISOString().split('T')[0], // "2023-10-25"
      status: r.status, // "Present", "Absent", "Half-Day", "On Leave"
      color: r.status === "Present" ? "green" : r.status === "Absent" ? "red" : "orange",
      hours: r.netWorkHours,
      isLate: r.flags.isLateEntry,
      isRegularized: r.regularization.status === "Approved",
      permissionUsed: r.permissionDurationMins > 0 ? `${r.permissionDurationMins}m` : null
    }));

    // Summary Counters
    const summary = {
      present: records.filter(r => r.status === "Present").length,
      absent: records.filter(r => r.status === "Absent").length,
      late: records.filter(r => r.flags.isLateEntry).length,
      permissions: records.filter(r => r.permissionDurationMins > 0).length,
      regularized: records.filter(r => r.regularization.status === "Approved").length
    };

    return { calendarData, summary };
  }

  // GET ALL EMPLOYEES (Daily Report)
  static async getDailyReport(date) {
    const targetDate = new Date(date);
    targetDate.setUTCHours(0,0,0,0);

    const records = await UserAttendanceModel.find({ date: targetDate })
      .populate("employeeId", "name employeeID department designation") // Fetch Employee Details
      .sort({ "flags.isLateEntry": -1 }); // Late comers first

    return records.map(r => ({
      id: r.employeeId?.employeeID || "N/A",
      name: r.employeeId?.name || "Unknown",
      dept: r.employeeId?.department || "-",
      inTime: r.firstIn ? new Date(r.firstIn).toLocaleTimeString('en-IN') : "-",
      outTime: r.lastOut ? new Date(r.lastOut).toLocaleTimeString('en-IN') : "-",
      status: r.status,
      late: r.flags.isLateEntry ? "Yes" : "No",
      permission: r.permissionDurationMins > 0 ? `${r.permissionDurationMins}m` : "-",
      location: r.timeline[0]?.location?.address || "Unknown"
    }));
  }

  static async getMonthlyAttendanceReport(month, year) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0)); 

    // MongoDB Aggregation Pipeline
    const report = await UserAttendanceModel.aggregate([
      // 1. Filter by Date Range
      { $match: { date: { $gte: startDate, $lte: endDate } } },

      // 2. Join with Employee Data
      {
        $lookup: {
          from: "employees", // Ensure this matches your collection name
          localField: "employeeId",
          foreignField: "_id",
          as: "employee"
        }
      },
      { $unwind: "$employee" },

      // 3. Group by Employee
      {
        $group: {
          _id: "$employeeId",
          employeeName: { $first: "$employee.name" },
          employeeCode: { $first: "$employee.employeeID" },
          department: { $first: "$employee.department" },
          
          // Calculate Counts
          totalPresent: { 
            $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] } 
          },
          totalAbsent: { 
            $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] } 
          },
          totalHalfDay: { 
            $sum: { $cond: [{ $eq: ["$status", "Half-Day"] }, 1, 0] } 
          },
          totalLate: { 
            $sum: { $cond: [{ $eq: ["$flags.isLateEntry", true] }, 1, 0] } 
          },
          totalLeaves: { 
            $sum: { $cond: [{ $eq: ["$status", "On Leave"] }, 1, 0] } 
          },
          totalPermissions: { 
            $sum: { $cond: [{ $gt: ["$permissionDurationMins", 0] }, 1, 0] } 
          },

          // Create Daily Calendar Array
          attendanceLog: {
            $push: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              status: "$status",
              inTime: { $dateToString: { format: "%H:%M", date: "$firstIn", timezone: "Asia/Kolkata" } },
              outTime: { $dateToString: { format: "%H:%M", date: "$lastOut", timezone: "Asia/Kolkata" } },
              isLate: "$flags.isLateEntry",
              isRegularized: { $eq: ["$regularization.status", "Approved"] }
            }
          }
        }
      },

      // 4. Sort by Name
      { $sort: { employeeName: 1 } }
    ]);

    return report;
  }
}

export default AttendanceService;
