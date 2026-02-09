import { getDistanceFromLatLonInMeters } from "../../../../utils/geofunction.js";
import CalendarService from "../holidays/holiday.service.js";
import LeaveRequestModel from "../leave/leaverequest.model.js";
import UserAttendanceModel from "./userAttendance.model.js";
import { SHIFT_RULES } from "../../../../utils/shiftRules.js"; 


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
      hour12: false // keeping 24h format for internal consistency
    });
  }

  static getISTWallTime(date) {
    if (!date) return null;
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 Hours 30 Mins in MS
    return new Date(date.getTime() + istOffset);
  }

static async performPunch1(data) {
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
      remarks, // ✅ User's remark (e.g., "Traffic delay") - ONLY for Timeline
      testDate
    } = data;
    
    const now =  new Date(testDate);    
    const today =  new Date(testDate);  
    today.setUTCHours(0, 0, 0, 0); // Normalized Date

// ---------------------------------------------------------
// 1. FETCH RECORD
// ---------------------------------------------------------
let attendance = await UserAttendanceModel.findOne({ employeeId, date: today });


// A. Check-In Requirement: Nothing can happen without an 'In' punch
if (!attendance) {
    if (punchType !== "In") {
        console.error("❌ Error: Action before Check-In");
        throw { statusCode: 400, message: "No attendance record found. You must Check-In first." };
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
        console.error("❌ Error: Post-Checkout Action");
        throw { statusCode: 400, message: "You have already checked out for the day." };
    }

    // C. Daily Limits & Single-Entry Rules
    if (punchType === "In") {
        throw { statusCode: 400, message: "You are already checked in." };
    }
    if (punchType === "LunchStart" && punchCounts["LunchStart"] >= 1) {
        throw { statusCode: 400, message: "Limit Exceeded: Lunch break already taken." };
    }
    if (punchType === "BreakStart" && punchCounts["BreakStart"] >= 2) {
        throw { statusCode: 400, message: "Limit Exceeded: Max 2 breaks allowed." };
    }

    // D. State-Based Flow (Sequential Logic)

    // 1. Forced Completion: If on Lunch, must end Lunch. If on Break, must end Break.
    if (lastPunchType === "LunchStart" && punchType !== "LunchEnd") {
        throw { statusCode: 400, message: "Action blocked: You must end your Lunch break first." };
    }
    if (lastPunchType === "BreakStart" && punchType !== "BreakEnd") {
        throw { statusCode: 400, message: "Action blocked: You must end your Break first." };
    }

    // 2. Reverse Prevention: Cannot end what hasn't started
    if (punchType === "LunchEnd" && lastPunchType !== "LunchStart") {
        throw { statusCode: 400, message: "Invalid Action: No active Lunch session to end." };
    }
    if (punchType === "BreakEnd" && lastPunchType !== "BreakStart") {
        throw { statusCode: 400, message: "Invalid Action: No active Break session to end." };
    }

}

    // ---------------------------------------------------------
    // 2. LOCATION VALIDATION
    // ---------------------------------------------------------
    let distance = 0;
    let verificationMethod = "Manual";
    if (attendanceType === "Office" || attendanceType === "Site") {
       if (siteLatitude && siteLongitude) {
          distance = getDistanceFromLatLonInMeters(latitude, longitude, siteLatitude, siteLongitude);
          if (distance > 1000) throw { statusCode: 403, message: `Location mismatch. You are ${Math.round(distance)}m away from site.` };
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
      let systemRemarks = ""; // ✅ System Generated Remark
      let isLate = false;

      // --- A. CHECK FOR APPROVED LEAVE (Initial Check) ---
      const approvedLeave = await LeaveRequestModel.findOne({
          employeeId: employeeId,
          status: { $in: ["Manager Approved", "HR Approved"] },
          fromDate: { $lte: today },
          toDate: { $gte: today }
      });

      if (approvedLeave) {
          initialStatus = "Absent"; 
          systemRemarks = `Work on Approved Leave (${approvedLeave.leaveType})`;
      }

      // --- B. CHECK LATE ENTRY ---
      if (!isHolidayWork) {
        const shiftStart = AttendanceService.getTimeOnDate(now, rule.startTime);
        const graceTime = new Date(shiftStart.getTime() + (rule.gracePeriodMins * 60000));
        
        if (now > graceTime) {
          isLate = true;
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          const lateCount = await UserAttendanceModel.countDocuments({
              employeeId, date: { $gte: startOfMonth, $lt: today }, "flags.isLateEntry": true
          });
          
          // STRICT: Mark Absent if Late
          initialStatus = "Absent"; 
          const lateMsg = `Late Entry #${lateCount + 1}`;
          systemRemarks = systemRemarks ? `${systemRemarks} | ${lateMsg}` : lateMsg;
        }
      }

      if (isHolidayWork) {
          initialStatus = "Holiday";
          systemRemarks = "Holiday Work";
      }

      attendance = new UserAttendanceModel({
        employeeId,
        date: today,
        shiftConfig: rule.type,
        firstIn: now,
        status: initialStatus,
        workType: isHolidayWork ? "Holiday Work" : "Regular",
        attendanceType,
        flags: { isLateEntry: isLate },
        remarks: systemRemarks, // ✅ Only System Remarks here
        timeline: [],
        sessions: []
      });
    }

    // ---------------------------------------------------------
    // 4. SESSION MANAGEMENT
    // ---------------------------------------------------------
    const openSession = attendance.sessions.find(s => !s.endTime);
    if (openSession) {
       openSession.endTime = now;
       openSession.durationMins = Math.round((now - new Date(openSession.startTime)) / 60000);
    }

    let newSession = null;
    if (["In", "BreakEnd", "LunchEnd"].includes(punchType)) newSession = { startTime: now, type: "Work", isBillable: true };
    else if (punchType === "LunchStart") newSession = { startTime: now, type: "Lunch", isBillable: false };
    else if (punchType === "BreakStart") newSession = { startTime: now, type: "Break", isBillable: false };
    
    if (newSession) attendance.sessions.push(newSession);

    // ---------------------------------------------------------
    // 5. TIMELINE UPDATE
    // ---------------------------------------------------------
    const timelineEntry = {
      punchType,
      timestamp: now,
      location: { lat: latitude, lng: longitude, address, distanceFromSite: distance, isMock: false },
      device: { deviceId, model: deviceModel, ip: ipAddress },
      verification: { method: verificationMethod, photoUrl },
      remarks: remarks // ✅ User's manual remark goes ONLY here
    };

    if (attendanceType === "Office") {
        timelineEntry.geofenceId = geofenceId;
        timelineEntry.geofenceSiteId = null;
    } else if (attendanceType === "Site") {
        timelineEntry.geofenceSiteId = geofenceSiteId;
        timelineEntry.geofenceId = null;
    } else {
        timelineEntry.geofenceId = null;
        timelineEntry.geofenceSiteId = null;
    }
    attendance.timeline.push(timelineEntry);

    // ---------------------------------------------------------
    // 6. CALCULATE SUMMARIES
    // ---------------------------------------------------------
    if (["Out", "BreakStart", "LunchStart"].includes(punchType)) attendance.lastOut = now;
    if (attendance.firstIn && attendance.lastOut) {
       attendance.totalDuration = Math.round((attendance.lastOut - attendance.firstIn) / 60000);
    }

    const workSessions = attendance.sessions.filter(s => s.type === "Work" && s.endTime);
    const totalWorkMins = workSessions.reduce((acc, s) => acc + (s.durationMins || 0), 0);
    attendance.netWorkHours = parseFloat((totalWorkMins / 60).toFixed(2));
    
    const breakSessions = attendance.sessions.filter(s => (s.type === "Break" || s.type === "Lunch") && s.endTime);
    attendance.totalBreakTime = breakSessions.reduce((acc, s) => acc + (s.durationMins || 0), 0);

    // ---------------------------------------------------------
    // 7. FLAGS (Early Exit)
    // ---------------------------------------------------------
    if (punchType === "Out") {
       const shiftEnd = AttendanceService.getTimeOnDate(now, attendance.shiftConfig.endTime);
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
        }else{
          attendance.rewards.isCompOffEligible = false;
          attendance.rewards.compOffCredit = 0;
          attendance.rewards.approvalStatus = "Rejected";
        }
    }

    // ---------------------------------------------------------
    // 9. FINAL STATUS UPDATE (On Checkout)
    // ---------------------------------------------------------
    if (punchType === "Out" && attendance.workType !== "Holiday Work") {
        
        // A. Re-Check Leave Status
        const activeLeave = await LeaveRequestModel.findOne({
            employeeId: employeeId,
            status: { $in: ["Manager Approved", "HR Approved"] },
            fromDate: { $lte: today },
            toDate: { $gte: today }
        });

        // B. Count Lates for Penalty Logic
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lateCount = await UserAttendanceModel.countDocuments({
            employeeId, 
            date: { $gte: startOfMonth, $lt: today }, 
            "flags.isLateEntry": true
        });

        const isLate = attendance.flags.isLateEntry;
        const isLeave = !!activeLeave;
        const currentLateCount = isLate ? lateCount + 1 : lateCount; 

        // --- C. LOGIC TREE ---
        
        if (isLeave) {
             // Case 1: Work on Leave -> Strict Absent
             attendance.status = "Absent";
             attendance.remarks = `Work on Approved Leave (${activeLeave.leaveType}) | Regularization Required`;
        } 
        else if (isLate) {
             // Case 2: LATE ENTRY LOGIC
             
             if (currentLateCount > 3) {
                 // Case 2a: Penalty (4th Late onwards) -> Mark HALF-DAY
                 attendance.status = "Half-Day";
                 attendance.remarks = `Late Penalty (${currentLateCount}th Late) | Worked: ${attendance.netWorkHours} hrs`;
                 
                 // Explicitly record penalty in payroll object
                 attendance.payroll.penalty.isApplied = true;
                 attendance.payroll.penalty.type = "Late Deduction";
                 attendance.payroll.penalty.deductionAmount = 0.5;

             } else {
                 // Case 2b: Warning (1st-3rd Late) -> Mark ABSENT (Forces Regularization)
                 attendance.status = "Absent";
                 attendance.remarks = `Late Entry #${currentLateCount} | HR Regularization Required`;
             }
        } 
        else {
             // Case 3: NORMAL ENTRY (Clean Record)
             if (attendance.netWorkHours >= 7) {
                 attendance.status = "Present";
                 attendance.remarks = "Shift Completed";
             } else if (attendance.netWorkHours >= 4) {
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
          netWorkHours: attendance.netWorkHours,
          status: attendance.status,
          isLate: attendance.flags.isLateEntry
       }
    };
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
      testDate // Optional: For testing
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
    let attendance = await UserAttendanceModel.findOne({ employeeId, date: today });

    // --- A. VALIDATION CHECKS ---
if (!attendance) {
    if (punchType !== "In") {
        console.error("❌ Error: Action before Check-In");
        throw { statusCode: 400, message: "No attendance record found. You must Check-In first." };
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
        console.error("❌ Error: Post-Checkout Action");
        throw { statusCode: 400, message: "You have already checked out for the day." };
    }

    // C. Daily Limits & Single-Entry Rules
    if (punchType === "In") {
        throw { statusCode: 400, message: "You are already checked in." };
    }
    if (punchType === "LunchStart" && punchCounts["LunchStart"] >= 1) {
        throw { statusCode: 400, message: "Limit Exceeded: Lunch break already taken." };
    }
    if (punchType === "BreakStart" && punchCounts["BreakStart"] >= 2) {
        throw { statusCode: 400, message: "Limit Exceeded: Max 2 breaks allowed." };
    }

    // D. State-Based Flow (Sequential Logic)

    // 1. Forced Completion: If on Lunch, must end Lunch. If on Break, must end Break.
    if (lastPunchType === "LunchStart" && punchType !== "LunchEnd") {
        throw { statusCode: 400, message: "Action blocked: You must end your Lunch break first." };
    }
    if (lastPunchType === "BreakStart" && punchType !== "BreakEnd") {
        throw { statusCode: 400, message: "Action blocked: You must end your Break first." };
    }

    // 2. Reverse Prevention: Cannot end what hasn't started
    if (punchType === "LunchEnd" && lastPunchType !== "LunchStart") {
        throw { statusCode: 400, message: "Invalid Action: No active Lunch session to end." };
    }
    if (punchType === "BreakEnd" && lastPunchType !== "BreakStart") {
        throw { statusCode: 400, message: "Invalid Action: No active Break session to end." };
    }

}

    // ---------------------------------------------------------
    // 2. LOCATION VALIDATION
    // ---------------------------------------------------------
    let distance = 0;
    let verificationMethod = "Manual";
    if (attendanceType === "Office" || attendanceType === "Site") {
       if (siteLatitude && siteLongitude) {
          distance = getDistanceFromLatLonInMeters(latitude, longitude, siteLatitude, siteLongitude);
          if (distance > 1000) throw { statusCode: 403, message: `Location mismatch. ${Math.round(distance)}m away.` };
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
          toDate: { $gte: today }
      });

      if (approvedLeave) {
          initialStatus = "Absent"; 
          systemRemarks = `Work on Approved Leave (${approvedLeave.leaveType})`;
      }

      // Check Late
      if (!isHolidayWork) {
        const shiftStart = AttendanceService.getTimeOnDate(now, rule.startTime);
        const graceTime = new Date(shiftStart.getTime() + (rule.gracePeriodMins * 60000));
        
        if (now > graceTime) {
          isLate = true;
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          const lateCount = await UserAttendanceModel.countDocuments({
              employeeId, date: { $gte: startOfMonth, $lt: today }, "flags.isLateEntry": true
          });
          initialStatus = "Absent"; 
          systemRemarks = systemRemarks ? `${systemRemarks} | Late Entry #${lateCount + 1}` : `Late Entry #${lateCount + 1}`;
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
            shiftType:rule.type,
            istStartTime: rule.startTime, 
            istEndTime: rule.endTime
        },

        firstIn: now,
        istFirstIn: nowIST, // ✅ Storing 09:00:00 here
        
        status: initialStatus,
        workType: isHolidayWork ? "Holiday Work" : "Regular",
        attendanceType,
        flags: { isLateEntry: isLate },
        remarks: systemRemarks,
        timeline: [],
        sessions: []
      });
    }

    // ---------------------------------------------------------
    // 4. SESSION MANAGEMENT
    // ---------------------------------------------------------
    const openSession = attendance.sessions.find(s => !s.endTime);
    if (openSession) {
       openSession.endTime = now;
       openSession.istEndTime = nowIST; // ✅ IST
       openSession.durationMins = Math.round((now - new Date(openSession.startTime)) / 60000);
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
      location: { lat: latitude, lng: longitude, address, distanceFromSite: distance, isMock: false },
      device: { deviceId, model: deviceModel, ip: ipAddress },
      verification: { method: verificationMethod, photoUrl },
      remarks: remarks 
    };

    if (attendanceType === "Office") timelineEntry.geofenceId = geofenceId;
    else if (attendanceType === "Site") timelineEntry.geofenceSiteId = geofenceSiteId;
    
    attendance.timeline.push(timelineEntry);

    // ---------------------------------------------------------
    // 6. CALCULATE SUMMARIES
    // ---------------------------------------------------------
    if (["Out", "BreakStart", "LunchStart"].includes(punchType)) {
        attendance.lastOut = now;
        attendance.istLastOut = nowIST; // ✅ IST
    }

    if (attendance.firstIn && attendance.lastOut) {
       attendance.totalDuration = Math.round((attendance.lastOut - attendance.firstIn) / 60000);
    }

    const workSessions = attendance.sessions.filter(s => s.type === "Work" && s.endTime);
    const totalWorkMins = workSessions.reduce((acc, s) => acc + (s.durationMins || 0), 0);
    attendance.netWorkHours = parseFloat((totalWorkMins / 60).toFixed(2));
    
    const breakSessions = attendance.sessions.filter(s => (s.type === "Break" || s.type === "Lunch") && s.endTime);
    attendance.totalBreakTime = breakSessions.reduce((acc, s) => acc + (s.durationMins || 0), 0);

    // ---------------------------------------------------------
    // 7. FLAGS (Early Exit)
    // ---------------------------------------------------------
    if (punchType === "Out") {
       const shiftEnd = AttendanceService.getTimeOnDate(now, attendance.shiftConfig.endTime);
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
            toDate: { $gte: today }
        });

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lateCount = await UserAttendanceModel.countDocuments({
            employeeId, date: { $gte: startOfMonth, $lt: today }, "flags.isLateEntry": true
        });

        const isLate = attendance.flags.isLateEntry;
        const isLeave = !!activeLeave;
        const currentLateCount = isLate ? lateCount + 1 : lateCount; 

        if (isLeave) {
             attendance.status = "Absent";
             attendance.remarks = `Work on Approved Leave (${activeLeave.leaveType}) | Regularization Required`;
        } 
        else if (isLate) {
             if (currentLateCount > 3) {
                 attendance.status = "Half-Day";
                 attendance.remarks = `Late Penalty (${currentLateCount}th Late) | Worked: ${attendance.netWorkHours} hrs`;
                 attendance.payroll.penalty = { isApplied: true, type: "Late Deduction", deductionAmount: 0.5 };
             } else {
                 attendance.status = "Absent";
                 attendance.remarks = `Late Entry #${currentLateCount} | HR Regularization Required`;
             }
        } 
        else {
             if (attendance.netWorkHours >= 7) {
                 attendance.status = "Present";
                 attendance.remarks = "Shift Completed";
             } else if (attendance.netWorkHours >= 4) {
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
          status: attendance.status
       }
    };
  }
}



export default AttendanceService;


