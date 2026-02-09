import { getDistanceFromLatLonInMeters } from "../../../../utils/geofunction.js";
import CalendarService from "../holidays/holiday.service.js";
import LeaveRequestModel from "../leave/leaverequest.model.js";
import UserAttendanceModel from "./userAttendance.model.js";
import { SHIFT_RULES } from "../../../../utils/shiftRules.js"; 


class AttendanceService {

  // Helper: Parse HH:mm to Date for Today
  static getTimeOnDate(baseDate, timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
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
      remarks // ✅ User's remark (e.g., "Traffic delay") - ONLY for Timeline
    } = data;

    const now = new Date();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalized Date

    // ---------------------------------------------------------
    // 1. FETCH OR CREATE RECORD
    // ---------------------------------------------------------
    let attendance = await UserAttendanceModel.findOne({ employeeId, date: today });

    // --- VALIDATION: CHECK DAILY LIMITS ---
    if (attendance) {
        const timeline = attendance.timeline;
        if (punchType === "LunchStart" && timeline.filter(t => t.punchType === "LunchStart").length >= 1) {
            throw { statusCode: 400, message: "Limit Exceeded: Lunch break already taken." };
        }
        if (punchType === "BreakStart" && timeline.filter(t => t.punchType === "BreakStart").length >= 2) {
            throw { statusCode: 400, message: "Limit Exceeded: Max 2 breaks allowed." };
        }
        
        // Double Punch Validations
        const lastPunch = attendance.timeline[attendance.timeline.length - 1];
        if (["In", "BreakEnd", "LunchEnd"].includes(punchType) && ["In", "BreakEnd", "LunchEnd"].includes(lastPunch.punchType)) {
             throw { statusCode: 400, message: "You are already actively working." };
        }
        if (["Out", "BreakStart", "LunchStart"].includes(punchType) && ["Out", "BreakStart", "LunchStart"].includes(lastPunch.punchType)) {
             throw { statusCode: 400, message: "You are already checked out or on break." };
        }
    } else if (punchType !== "In") {
        throw { statusCode: 404, message: "No attendance record found. You must Check-In first." };
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
        shiftConfig: { ...rule, shiftType },
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

  static async performPunchlog(data) {
    console.log("---------------------------------------------------------");
    console.log("🚀 START PUNCH PROCESS:", new Date().toISOString());
    console.log("📦 Input Data:", JSON.stringify({ ...data, photoUrl: "HIDDEN" }, null, 2));

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
      remarks // ✅ User's remark (e.g., "Traffic delay") - ONLY for Timeline
    } = data;

    const now = new Date();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalized Date

    // ---------------------------------------------------------
    // 1. FETCH OR CREATE RECORD
    // ---------------------------------------------------------
    let attendance = await UserAttendanceModel.findOne({ employeeId, date: today });
    console.log("🔍 Existing Record Found?", !!attendance);

    // --- VALIDATION: CHECK DAILY LIMITS ---
    if (attendance) {
        const timeline = attendance.timeline;
        
        if (punchType === "LunchStart") {
            const lunchCount = timeline.filter(t => t.punchType === "LunchStart").length;
            console.log(`🥪 Lunch Count: ${lunchCount}`);
            if (lunchCount >= 1) {
                console.error("❌ Error: Lunch Limit Exceeded");
                throw { statusCode: 400, message: "Limit Exceeded: Lunch break already taken." };
            }
        }
        if (punchType === "BreakStart") {
            const breakCount = timeline.filter(t => t.punchType === "BreakStart").length;
            console.log(`☕ Break Count: ${breakCount}`);
            if (breakCount >= 2) {
                console.error("❌ Error: Break Limit Exceeded");
                throw { statusCode: 400, message: "Limit Exceeded: Max 2 breaks allowed." };
            }
        }
        
        // Double Punch Validations
        const lastPunch = attendance.timeline[attendance.timeline.length - 1];
        console.log(`🔄 Last Punch: ${lastPunch.punchType} | New Punch: ${punchType}`);

        if (["In", "BreakEnd", "LunchEnd"].includes(punchType) && ["In", "BreakEnd", "LunchEnd"].includes(lastPunch.punchType)) {
             console.error("❌ Error: Double Work Start");
             throw { statusCode: 400, message: "You are already actively working." };
        }
        if (["Out", "BreakStart", "LunchStart"].includes(punchType) && ["Out", "BreakStart", "LunchStart"].includes(lastPunch.punchType)) {
             console.error("❌ Error: Double Out/Break");
             throw { statusCode: 400, message: "You are already checked out or on break." };
        }
    } else if (punchType !== "In") {
        console.error("❌ Error: Action before Check-In");
        throw { statusCode: 404, message: "No attendance record found. You must Check-In first." };
    }

    // ---------------------------------------------------------
    // 2. LOCATION VALIDATION
    // ---------------------------------------------------------
    let distance = 0;
    let verificationMethod = "Manual";
    if (attendanceType === "Office" || attendanceType === "Site") {
       if (siteLatitude && siteLongitude) {
          distance = getDistanceFromLatLonInMeters(latitude, longitude, siteLatitude, siteLongitude);
          console.log(`📍 Distance Check: ${distance.toFixed(2)}m (Max: 1000m)`);
          
          if (distance > 1000) {
              console.error("❌ Error: Location Mismatch");
              throw { statusCode: 403, message: `Location mismatch. You are ${Math.round(distance)}m away from site.` };
          }
          verificationMethod = "Geofence";
       } else {
           console.warn("⚠️ Warning: Office/Site Check-in but no Site Coords provided.");
       }
    }

    // ---------------------------------------------------------
    // 3. INITIALIZE NEW RECORD (First Check-In Logic)
    // ---------------------------------------------------------
    if (!attendance) {
      console.log("✨ Initializing New Attendance Record...");
      const rule = SHIFT_RULES[shiftType] || SHIFT_RULES["General"];
      const dayStatus = await CalendarService.checkDayStatus(today);
      const isHolidayWork = !dayStatus.isWorkingDay;
      console.log(`📅 Day Status: ${isHolidayWork ? "Holiday" : "Work Day"}`);

      let initialStatus = "Present";
      let systemRemarks = ""; 
      let isLate = false;

      // --- A. CHECK FOR APPROVED LEAVE (Initial Check) ---
      const approvedLeave = await LeaveRequestModel.findOne({
          employeeId: employeeId,
          status: { $in: ["Manager Approved", "HR Approved"] },
          fromDate: { $lte: today },
          toDate: { $gte: today }
      });

      if (approvedLeave) {
          console.log(`🏖️ User is on Approved Leave: ${approvedLeave.leaveType}`);
          initialStatus = "Absent"; 
          systemRemarks = `Work on Approved Leave (${approvedLeave.leaveType})`;
      }

      // --- B. CHECK LATE ENTRY ---
      if (!isHolidayWork) {
        const shiftStart = AttendanceService.getTimeOnDate(now, rule.startTime);
        const graceTime = new Date(shiftStart.getTime() + (rule.gracePeriodMins * 60000));
        
        console.log(`⏰ Shift Start: ${rule.startTime} | Grace Time: ${graceTime.toLocaleTimeString()}`);

        if (now > graceTime) {
          isLate = true;
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          const lateCount = await UserAttendanceModel.countDocuments({
              employeeId, date: { $gte: startOfMonth, $lt: today }, "flags.isLateEntry": true
          });
          
          console.log(`⚠️ Late Entry Detected! Count this month: ${lateCount}`);

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
        shiftConfig: { ...rule, shiftType },
        firstIn: now,
        status: initialStatus,
        workType: isHolidayWork ? "Holiday Work" : "Regular",
        attendanceType,
        flags: { isLateEntry: isLate },
        remarks: systemRemarks, 
        timeline: [],
        sessions: []
      });
      console.log(`✅ Initial Status Set To: ${initialStatus}`);
    }

    // ---------------------------------------------------------
    // 4. SESSION MANAGEMENT
    // ---------------------------------------------------------
    const openSession = attendance.sessions.find(s => !s.endTime);
    if (openSession) {
       openSession.endTime = now;
       openSession.durationMins = Math.round((now - new Date(openSession.startTime)) / 60000);
       console.log(`🔒 Closed Session [${openSession.type}]: ${openSession.durationMins} mins`);
    }

    let newSession = null;
    if (["In", "BreakEnd", "LunchEnd"].includes(punchType)) newSession = { startTime: now, type: "Work", isBillable: true };
    else if (punchType === "LunchStart") newSession = { startTime: now, type: "Lunch", isBillable: false };
    else if (punchType === "BreakStart") newSession = { startTime: now, type: "Break", isBillable: false };
    
    if (newSession) {
        console.log(`🔓 Opened New Session [${newSession.type}]`);
        attendance.sessions.push(newSession);
    }

    // ---------------------------------------------------------
    // 5. TIMELINE UPDATE
    // ---------------------------------------------------------
    const timelineEntry = {
      punchType,
      timestamp: now,
      location: { lat: latitude, lng: longitude, address, distanceFromSite: distance, isMock: false },
      device: { deviceId, model: deviceModel, ip: ipAddress },
      verification: { method: verificationMethod, photoUrl },
      remarks: remarks 
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
    
    console.log(`📊 Updated Summaries -> Net Work Hours: ${attendance.netWorkHours}`);

    const breakSessions = attendance.sessions.filter(s => (s.type === "Break" || s.type === "Lunch") && s.endTime);
    attendance.totalBreakTime = breakSessions.reduce((acc, s) => acc + (s.durationMins || 0), 0);

    // ---------------------------------------------------------
    // 7. FLAGS (Early Exit)
    // ---------------------------------------------------------
    if (punchType === "Out") {
       const shiftEnd = AttendanceService.getTimeOnDate(now, attendance.shiftConfig.endTime);
       if (shiftEnd && now < shiftEnd) {
           console.log("⚠️ Early Exit Detected");
           attendance.flags.isEarlyExit = true;
       }
    }

    // ---------------------------------------------------------
    // 8. HOLIDAY COMP-OFF
    // ---------------------------------------------------------
    if (attendance.workType === "Holiday Work") {
        console.log("🎉 Evaluating Holiday Comp-Off...");
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
            attendance.rewards.compOffCredit = 0;
            attendance.rewards.approvalStatus = "Rejected";
        }
        console.log(`🎁 Comp-Off Result: ${attendance.rewards.compOffCredit}`);
    }

    // ---------------------------------------------------------
    // 9. FINAL STATUS UPDATE (On Checkout)
    // ---------------------------------------------------------
    if (punchType === "Out" && attendance.workType !== "Holiday Work") {
        console.log("🏁 Evaluating Final Status on Checkout...");

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
        
        console.log(`📋 Status Check Inputs -> Late: ${isLate} (Count: ${currentLateCount}), Leave: ${isLeave}, Hours: ${attendance.netWorkHours}`);

        // --- C. LOGIC TREE ---
        
        if (isLeave) {
             // Case 1: Work on Leave -> Strict Absent
             attendance.status = "Absent";
             attendance.remarks = `Work on Approved Leave (${activeLeave.leaveType}) | Regularization Required`;
             console.log("🛑 Status Forced: Absent (Work on Leave)");
        } 
        else if (isLate) {
             // Case 2: LATE ENTRY LOGIC
             
             if (currentLateCount > 3) {
                 // Case 2a: Penalty (4th Late onwards) -> Mark HALF-DAY
                 attendance.status = "Half-Day";
                 attendance.remarks = `Late Penalty (${currentLateCount}th Late) | Worked: ${attendance.netWorkHours} hrs`;
                 
                 attendance.payroll.penalty.isApplied = true;
                 attendance.payroll.penalty.type = "Late Deduction";
                 attendance.payroll.penalty.deductionAmount = 0.5;
                 console.log("⚖️ Status Set: Half-Day (Late Penalty Applied)");

             } else {
                 // Case 2b: Warning (1st-3rd Late) -> Mark ABSENT (Forces Regularization)
                 attendance.status = "Absent";
                 attendance.remarks = `Late Entry #${currentLateCount} | HR Regularization Required`;
                 console.log("🛑 Status Forced: Absent (Late Warning)");
             }
        } 
        else {
             // Case 3: NORMAL ENTRY (Clean Record)
             if (attendance.netWorkHours >= 7) {
                 attendance.status = "Present";
                 attendance.remarks = "Shift Completed";
                 console.log("✅ Status Set: Present");
             } else if (attendance.netWorkHours >= 4) {
                 attendance.status = "Half-Day";
                 attendance.remarks = "Short Duration (Half Day)";
                 console.log("⚠️ Status Set: Half-Day (Short Duration)");
             } else {
                 attendance.status = "Absent";
                 attendance.remarks = "Insufficient Hours (< 4 hrs)";
                 console.log("🛑 Status Set: Absent (Insufficient Hours)");
             }
        }
    }

    await attendance.save();
    console.log("💾 Record Saved Successfully");
    console.log("---------------------------------------------------------");

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
}

export default AttendanceService;