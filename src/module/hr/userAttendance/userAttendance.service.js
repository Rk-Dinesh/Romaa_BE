import { getDistanceFromLatLonInMeters } from "../../../../utils/geofunction.js";
import CalendarService from "../holidays/holiday.service.js";
import LeaveRequestModel from "../leave/leaverequest.model.js";
import UserAttendanceModel from "./userAttendance.model.js";

const SHIFT_RULES = {
  Morning: { start: "09:00", end: "18:00", grace: 30, halfDayCutoff: "10:00" },
  Evening: { start: "14:00", end: "23:00", grace: 30, halfDayCutoff: "15:00" },
  Night: { start: "22:00", end: "07:00", grace: 30, halfDayCutoff: "23:00" },
};

class AttendanceService {
  static formatToISTString(dateObj) {
    return dateObj.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }

  // --- HELPER: Parse "09:30" to Date object for today ---
  static getTimeOnDate(dateObj, timeString) {
    const [hours, minutes] = timeString.split(":").map(Number);
    const newDate = new Date(dateObj);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  }

  // --- 1. CHECK-IN LOGIC ---
  static async performCheckIn(data) {
    const {
      employeeId,
      isOD,
      clientName,
      latitude,
      longitude,
      siteLatitude,
      siteLongitude,
      shiftType = "Morning",
    } = data;

    // A. Validate Location
    const distance = getDistanceFromLatLonInMeters(
      latitude,
      longitude,
      siteLatitude,
      siteLongitude,
    );
    if (isOD) {
      // If On-Duty, we SKIP the distance check
      // OR we just log where they are without blocking them.
      // Futuristc: You could require "Manager Approval" for OD.
    } else {
      // Strict Geofence for Regular Check-in
      const distance = getDistanceFromLatLonInMeters(
        latitude,
        longitude,
        siteLatitude,
        siteLongitude,
      );
      if (distance > 1000) throw { statusCode: 403, message: "Out of range" };
    }

    // B. Setup Dates
    const now = new Date();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // We check if there is any approved leave that covers "today"
    // const activeLeave = await LeaveRequestModel.findById({
    //     employeeId,
    //     status: "Approved", // Only block if fully approved
    //     fromDate: { $lte: today },
    //     toDate: { $gte: today }
    // });

    // if (activeLeave) {
    //     throw { 
    //         statusCode: 403, 
    //         message: `Check-in Blocked: You are on approved ${activeLeave.leaveType} leave today.` 
    //     };
    // }

    // C. Duplicate Check
    const exists = await UserAttendanceModel.exists({
      employeeId,
      date: today,
    });
    if (exists) throw { statusCode: 409, message: "Already checked in" };

    // D. Fetch Shift Config

    const dayStatus = await CalendarService.checkDayStatus(today);

    let status = "Present";
    let isLate = false;
    let lateReason = null;
    let remarks = null;
    let workType = "Regular";

    const rules = SHIFT_RULES[shiftType];

    if (!dayStatus.isWorkingDay) {
      // === CASE 1: IT IS A HOLIDAY / WEEK OFF ===
      // Logic: Allow check-in, but DO NOT mark late.
      // Status is automatically "Present" (or you can calculate OT later).
      remarks = `Working on ${dayStatus.reason}`; // e.g., "Working on Sunday"
      workType = dayStatus.reason;

      // We skip the "Late" and "Half-Day" calculations entirely.
    } else {
      const shiftStart = this.getTimeOnDate(now, rules.start);
      const graceTime = new Date(shiftStart.getTime() + rules.grace * 60000); // 9:30
      const halfDayCutoff = this.getTimeOnDate(now, rules.halfDayCutoff); // 10:00

      if (now > graceTime) {
        isLate = true;

        // Rule 1: > 10:00 AM -> Immediate Half Day
        if (now > halfDayCutoff) {
          status = "Half-Day";
          lateReason = "Entry after Half-Day Cutoff";
        }
        // Rule 2: 3-Late Penalty Check
        else {
          // Count previous lates in current month
          const startOfMonth = new Date(
            today.getFullYear(),
            today.getMonth(),
            1,
          );
          const lateCount = await UserAttendanceModel.countDocuments({
            employeeId,
            date: { $gte: startOfMonth, $lt: today },
            "checkIn.isLate": true,
          });

          // If user already has 3 lates, this is the 4th one -> Mark Half Day
          if (lateCount >= 3) {
            status = "Half-Day";
            lateReason = "3-Late Penalty Applied";
          } else {
            lateReason = `Late Count: ${lateCount + 1}`;
          }
        }
      }
    }

    // E. Late Logic Calculations

    // F. Create Record
    const newRecord = new UserAttendanceModel({
      employeeId,
      date: today,
      checkIn: {
        time: now,
        timeIST: this.formatToISTString(now),
        visitType: isOD ? "Client Visit" : "Regular",
        clientName: isOD ? clientName : null,
        isLate,
        lateReason,
        location: { lat: latitude, lng: longitude, address: data.address },
        photoUrl: data.photoUrl,
      },
      shiftConfig: {
        shiftType,
        startTime: rules.start,
        endTime: rules.end,
        gracePeriodMins: rules.grace,
        halfDayEntryCutoff: rules.halfDayCutoff,
      },
      status: status, // "Present" or "Half-Day" (Penalty)
      workType,
    });

    await newRecord.save();
    return newRecord;
  }

  // --- 2. CHECK-OUT LOGIC ---
  static async performCheckOut(data) {
    const { employeeId, latitude, longitude, siteLatitude, siteLongitude } =
      data;

    // A. Validate Location
    const distance = getDistanceFromLatLonInMeters(
      latitude,
      longitude,
      siteLatitude,
      siteLongitude,
    );
    if (distance > 1000) throw { statusCode: 403, message: "Out of range" };

    // B. Find Today's Record
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const record = await UserAttendanceModel.findOne({
      employeeId,
      date: today,
    });

    if (!record) throw { statusCode: 404, message: "No Check-In found" };
    if (record.checkOut?.time)
      throw { statusCode: 409, message: "Already checked out" };

    // C. Calculate Duration
    const checkOutTime = new Date();
    const checkInTime = new Date(record.checkIn.time);
    const diffMs = checkOutTime - checkInTime;
    const totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

    // D. Determine Status based on Duration
    // Note: We use the "worst" status. If they were already marked "Half-Day" at entry
    // due to penalty, they stay "Half-Day" even if they work 9 hours.

    let durationStatus = "Present";

    if (totalHours < record.shiftConfig.minHalfDayHours) {
      // < 4 Hours -> Absent
      durationStatus = "Absent";
    } else if (totalHours < record.shiftConfig.minFullDayHours) {
      // 4 to 7.8 Hours -> Half-Day
      durationStatus = "Half-Day";
    } else {
      // > 7.8 Hours -> Present
      durationStatus = "Present";
    }

    // E. Final Status Logic (The "Min" Logic)
    // Priority: Absent > Half-Day > Present
    let finalStatus = record.status; // Start with Check-In status (Present or Half-Day)

    if (durationStatus === "Absent") {
      finalStatus = "Absent"; // Duration failure overrides everything
    } else if (durationStatus === "Half-Day" && finalStatus === "Present") {
      finalStatus = "Half-Day"; // Duration failure downgrades Present
    }
    // If duration is Present but Entry was Half-Day (Penalty), it stays Half-Day.

    // F. Update Record
    record.checkOut = {
      time: checkOutTime,
      timeIST: this.formatToISTString(checkOutTime),
      location: { lat: latitude, lng: longitude, address: data.address },
      photoUrl: data.photoUrl,
    };
    record.totalWorkingHours = totalHours;
    record.status = finalStatus;

    // Simple Overtime (Working > 9 hours)
    if (totalHours > 9) {
      record.overtimeHours = parseFloat((totalHours - 9).toFixed(2));
    }

    await record.save();
    return record;
  }

  static async raiseRegularization(data) {
    const { employeeId, date, reason, newCheckInTime, newCheckOutTime } = data;

    // 1. Find the Attendance Record
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    let record = await UserAttendanceModel.findOne({
      employeeId,
      date: targetDate,
    });

    // If record doesn't exist (User was Absent), create a skeleton record to regularize
    if (!record) {
      record = new UserAttendanceModel({
        employeeId,
        date: targetDate,
        status: "Absent",
        checkIn: {},
        checkOut: {},
      });
    }

    if (record.regularization?.status === "Pending") {
      throw {
        statusCode: 400,
        message: "A request is already pending for this date.",
      };
    }

    // 2. Update Request Details
    record.regularization = {
      status: "Pending",
      reason,
      correctedCheckIn: newCheckInTime ? new Date(newCheckInTime) : undefined,
      correctedCheckOut: newCheckOutTime
        ? new Date(newCheckOutTime)
        : undefined,
      requestedAt: new Date(),
    };

    await record.save();
    return { message: "Regularization request submitted successfully." };
  }

  // --- 4. ACTION REGULARIZATION (Manager/HR) ---
  static async actionRegularization(data) {
    const { managerId, employeeId, date, action, adminRemarks } = data; // action = "Approve" or "Reject"

    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const record = await UserAttendanceModel.findOne({
      employeeId,
      date: targetDate,
    });

    if (!record || record.regularization.status !== "Pending") {
      throw {
        statusCode: 404,
        message: "No pending request found for this date.",
      };
    }

    // A. Handle REJECT
    if (action === "Reject") {
      record.regularization.status = "Rejected";
      record.regularization.actionBy = managerId;
      record.regularization.actionDate = new Date();
      record.regularization.remarks = adminRemarks;
      await record.save();
      return { message: "Request rejected." };
    }

    // B. Handle APPROVE
    if (action === "Approve") {
      // 1. Update Actual Times
      if (record.regularization.correctedCheckIn) {
        record.checkIn.time = record.regularization.correctedCheckIn;
        record.checkIn.timeIST = this.formatToISTString(
          record.regularization.correctedCheckIn,
        );
        record.checkIn.location = { address: "Manual Regularization" }; // Optional: Tag location
      }

      if (record.regularization.correctedCheckOut) {
        record.checkOut.time = record.regularization.correctedCheckOut;
        record.checkOut.timeIST = this.formatToISTString(
          record.regularization.correctedCheckOut,
        );
        record.checkOut.location = { address: "Manual Regularization" };
      }

      // 2. Recalculate Hours & Status
      if (record.checkIn.time && record.checkOut.time) {
        const diffMs =
          new Date(record.checkOut.time) - new Date(record.checkIn.time);
        const totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

        record.totalWorkingHours = totalHours;

        // Simple Status Update based on hours
        if (totalHours >= 8) record.status = "Present";
        else if (totalHours >= 4) record.status = "Half-Day";
        else record.status = "Absent";

        // Overtime check
        if (totalHours > 9)
          record.overtimeHours = parseFloat((totalHours - 9).toFixed(2));
      }

      // 3. Close Request
      record.isRegularized = true;
      record.regularization.status = "Approved";
      record.regularization.actionBy = managerId;
      record.regularization.actionDate = new Date();
      record.regularization.remarks = adminRemarks;

      await record.save();
      return { message: "Request approved and attendance updated." };
    }
  }

  // --- 5. GET EMPLOYEE MONTHLY REPORT ---
  static async getMonthlyAttendance(employeeId, month, year) {
    // 1. Calculate Date Range (1st to Last day of Month)
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month

    // Set to UTC midnight for comparison
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    const logs = await UserAttendanceModel.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    // 2. Calculate Summary Stats
    const summary = {
      totalPresent: logs.filter((l) => l.status === "Present").length,
      totalAbsent: logs.filter((l) => l.status === "Absent").length,
      totalHalfDay: logs.filter((l) => l.status === "Half-Day").length,
      totalLates: logs.filter((l) => l.checkIn?.isLate).length,
      averageHours: 0,
    };

    if (logs.length > 0) {
      const totalHours = logs.reduce(
        (acc, curr) => acc + (curr.totalWorkingHours || 0),
        0,
      );
      summary.averageHours = (totalHours / logs.length).toFixed(2);
    }

    return { summary, logs };
  }

  // --- 6. LIVE TEAM DASHBOARD (Manager View) ---
  static async getLiveTeamStatus(managerId) {
    // A. Identify the Team (Employees reporting to this Manager)
    // We select specific fields to keep the query light
    const teamMembers = await mongoose
      .model("Employee")
      .find({
        reportsTo: managerId,
        status: "Active",
      })
      .select("_id name designation photoUrl phone");

    if (teamMembers.length === 0) {
      return {
        counts: { total: 0, present: 0, late: 0, absent: 0 },
        members: [],
      };
    }

    const teamIds = teamMembers.map((e) => e._id);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // B. Fetch Today's Attendance for these employees
    const todayLogs = await UserAttendanceModel.find({
      employeeId: { $in: teamIds },
      date: today,
    });

    // C. Merge Data & Calculate Stats
    let counts = {
      total: teamMembers.length,
      present: 0,
      late: 0,
      absent: 0, // Will be calculated
      onLeave: 0,
    };

    const memberStatusList = teamMembers.map((emp) => {
      const log = todayLogs.find(
        (l) => l.employeeId.toString() === emp._id.toString(),
      );

      let currentStatus = "Not Checked In";
      let punchTime = null;
      let location = null;
      let isLate = false;

      if (log) {
        // Determine granular status
        if (log.status === "On Leave") {
          currentStatus = "On Leave";
          counts.onLeave++;
        } else if (log.checkOut && log.checkOut.time) {
          currentStatus = "Checked Out";
          punchTime = log.checkOut.timeIST; // Using the Readable String
          counts.present++; // They came, so they are counted as present force
        } else if (log.checkIn && log.checkIn.time) {
          currentStatus = "Working";
          punchTime = log.checkIn.timeIST;
          location = log.checkIn.location?.address || "Unknown";
          counts.present++;

          if (log.checkIn.isLate) {
            isLate = true;
            counts.late++;
          }
        }
      } else {
        // No log found yet
        counts.absent++; // Technically "Not in yet"
      }

      return {
        employeeId: emp._id,
        name: emp.name,
        designation: emp.designation,
        photoUrl: emp.photoUrl,
        phone: emp.phone,
        status: currentStatus, // Working, Checked Out, Not Checked In
        punchTime: punchTime, // "10:30 AM"
        currentLocation: location,
        isLate: isLate,
      };
    });

    return {
      date: this.formatToISTString(new Date()), // Helper we created earlier
      counts,
      teamData: memberStatusList,
    };
  }
}

export default AttendanceService;
