import cron from "node-cron";
import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import UserAttendanceModel from "../src/module/hr/userAttendance/userAttendance.model.js";
import CalendarService from "../src/module/hr/holidays/holiday.service.js";
import LeaveRequestModel from "../src/module/hr/leave/leaverequest.model.js";
import { SHIFT_RULES } from "./shiftRules.js";

// FIX (Bug 1): Returns a real Date offset to IST wall-clock, not a locale string.
// Model fields (istTimestamp, istLastOut, istEndTime) are typed Date — must store a Date.
const getISTDate = (date) => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(new Date(date).getTime() + IST_OFFSET_MS);
};

// FIX (Bug 3): Align Present/Half-Day thresholds with performPunch service (>= 7 / >= 4)
const PRESENT_THRESHOLD_HRS  = 7;
const HALF_DAY_THRESHOLD_HRS = 4;

export const startAbsenteeismCron = () => {
  // Run every day at 23:59 (11:59 PM)
  cron.schedule("59 23 * * *", async () => {
    console.log("⏳ [CRON] Starting Daily Attendance Finalizer...");

    const now   = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));

    try {
      // 1. GLOBAL HOLIDAY CHECK
      const dayStatus      = await CalendarService.checkDayStatus(today);
      const isGlobalHoliday = !dayStatus.isWorkingDay;

      // FIX (Bug 2): Exclude soft-deleted employees
      const employees = await EmployeeModel.find({
        status: "Active",
        isDeleted: { $ne: true },
      }).select("_id shiftType");

      let stats = { processed: 0, absent: 0, autoCheckout: 0, onLeave: 0 };

      for (const emp of employees) {
        stats.processed++;

        let attendance = await UserAttendanceModel.findOne({
          employeeId: emp._id,
          date: today,
        });

        // =================================================================
        // SCENARIO A: NO ATTENDANCE RECORD (Didn't Punch In)
        // =================================================================
        if (!attendance) {
          const approvedLeave = await LeaveRequestModel.findOne({
            employeeId: emp._id,
            status: { $in: ["Manager Approved", "HR Approved"] },
            fromDate: { $lte: today },
            toDate:   { $gte: today },
            isCancelled: false,
          });

          let finalStatus = "Absent";
          let remarks     = "System Auto-Absent: No Punch Found";
          // FIX (Bug 4): Holiday without punch = status "Holiday", workType "Regular" (not "Holiday Work")
          let workType    = "Regular";
          let penaltyApplied = false;
          const rule = SHIFT_RULES[emp.shiftType] || SHIFT_RULES["General"];

          if (approvedLeave) {
            stats.onLeave++;
            finalStatus = "On Leave";
            remarks     = `Approved Leave: ${approvedLeave.leaveType}`;

            if (approvedLeave.requestType.includes("Half")) {
              finalStatus = "Half-Day";
            } else if (approvedLeave.leaveType === "Permission") {
              finalStatus = "Absent";
              remarks     = "Absent on Permission Day (No Punch)";
            }
          } else if (isGlobalHoliday) {
            finalStatus = "Holiday";
            remarks     = `Holiday: ${dayStatus.reason}`;
            // workType stays "Regular" — employee did NOT work today
          } else {
            stats.absent++;
            penaltyApplied = true;
          }

          // FIX (Bug 5): Use upsert instead of create — safe if cron runs twice
          await UserAttendanceModel.updateOne(
            { employeeId: emp._id, date: today },
            {
              $setOnInsert: {
                employeeId: emp._id,
                date:        today,
                status:      finalStatus,
                remarks,
                workType,
                shiftConfig: {
                  shiftType:    rule.type,
                  istStartTime: rule.startTime,
                  istEndTime:   rule.endTime,
                },
                timeline: [],
                sessions: [],
                netWorkHours: 0,
                payroll: {
                  isLocked: false,
                  penalty: {
                    isApplied:       penaltyApplied,
                    type:            penaltyApplied ? "No Pay" : undefined,
                    deductionAmount: penaltyApplied ? 1 : 0,
                  },
                },
              },
            },
            { upsert: true }
          );
          continue;
        }

        // =================================================================
        // SCENARIO B: RECORD EXISTS (Punched In)
        // =================================================================

        // Skip already-finalized states
        if (["On Leave", "Absent", "Holiday"].includes(attendance.status)) continue;

        // B1. MISSING CHECKOUT (Auto-Close)
        if (!attendance.lastOut) {
          if (attendance.shiftConfig?.isNightShift) {
            console.log(`🌙 Skipping Night Shift Employee: ${emp._id}`);
            continue;
          }

          stats.autoCheckout++;

          const shiftEndTimeStr = attendance.shiftConfig?.endTime || "18:00";
          const [h, m]          = shiftEndTimeStr.split(":").map(Number);
          const autoOutTime     = new Date(today);
          autoOutTime.setHours(h, m, 0, 0);

          // FIX (Bug 1): store real Date objects in Date-typed fields
          const autoOutIST = getISTDate(autoOutTime);

          attendance.timeline.push({
            punchType:    "Out",
            timestamp:    autoOutTime,
            istTimestamp: autoOutIST,           // ← Date, not string
            location:     { lat: 0, lng: 0, address: "System Auto-Checkout" },
            verification: { method: "Manual", confidenceScore: 100 },
            remarks:      "System Auto-Checkout (Missed Punch)",
          });

          const openSession = attendance.sessions.find((s) => !s.endTime);
          if (openSession) {
            openSession.endTime    = autoOutTime;
            openSession.istEndTime = autoOutIST; // ← Date, not string
            openSession.durationMins = Math.round(
              (autoOutTime - new Date(openSession.startTime)) / 60000,
            );
            openSession.isAutoClosed = true;
          }

          attendance.lastOut    = autoOutTime;
          attendance.istLastOut = autoOutIST;  // ← Date, not string
          attendance.flags.isAutoCheckOut = true;
          attendance.flags.hasDispute     = true;
          attendance.remarks = (attendance.remarks || "") + " | Auto-Checkout";
        }

        // B2. RECALCULATE NET HOURS
        if (attendance.firstIn && attendance.lastOut) {
          attendance.totalDuration = Math.round(
            (attendance.lastOut - attendance.firstIn) / 60000,
          );
        }

        const workSessions  = attendance.sessions.filter((s) => s.type === "Work" && s.endTime);
        const totalWorkMins = workSessions.reduce((acc, s) => acc + (s.durationMins || 0), 0);

        let effectiveMins = totalWorkMins;
        if (attendance.flags.isPermission && attendance.permissionDurationMins) {
          effectiveMins += attendance.permissionDurationMins;
        }

        attendance.netWorkHours = parseFloat((effectiveMins / 60).toFixed(2));

        // B3. FINAL STATUS
        // FIX (Bug 3): Use same thresholds as performPunch (>= 7 Present, >= 4 Half-Day)
        if (attendance.netWorkHours >= PRESENT_THRESHOLD_HRS) {
          attendance.status = "Present";
        } else if (attendance.netWorkHours >= HALF_DAY_THRESHOLD_HRS) {
          attendance.status = "Half-Day";
          attendance.payroll.penalty = {
            isApplied:       true,
            type:            "Half-Day Absent",
            deductionAmount: 0.5,
          };
        } else {
          attendance.status = "Absent";
          attendance.remarks = `Insufficient Hours (${attendance.netWorkHours} hrs)`;
          attendance.payroll.penalty = {
            isApplied:       true,
            type:            "No Pay",
            deductionAmount: 1,
          };
        }

        // B4. OVERTIME
        if (attendance.netWorkHours > 9) {
          attendance.overtimeHours = parseFloat((attendance.netWorkHours - 9).toFixed(2));
          attendance.workType      = "Overtime";
        }

        await attendance.save();
      }

      console.log("✅ [CRON] Finalizer Complete. Stats:", stats);
    } catch (err) {
      console.error("❌ [CRON] Job Failed:", err);
    }
  });
};
