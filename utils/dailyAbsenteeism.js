import cron from "node-cron";
import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import UserAttendanceModel from "../src/module/hr/userAttendance/userAttendance.model.js";
import CalendarService from "../src/module/hr/holidays/holiday.service.js";
import LeaveRequestModel from "../src/module/hr/leave/leaverequest.model.js";
import { SHIFT_RULES } from "./shiftRules.js";

// --- Helper: Get IST Time String ---
const getISTTime = (date) => {
  return new Date(date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
};

export const startAbsenteeismCron = () => {
  // Run every day at 23:59 (11:59 PM)
  cron.schedule("59 23 * * *", async () => {
    //every 1 minute for testing
    console.log("⏳ [CRON] Starting Daily Attendance Finalizer...");

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    );

    try {
      // 1. GLOBAL HOLIDAY CHECK
      const dayStatus = await CalendarService.checkDayStatus(today);
      const isGlobalHoliday = !dayStatus.isWorkingDay;

      // 2. FETCH ALL ACTIVE EMPLOYEES
      const employees = await EmployeeModel.find({ status: "Active" }).select(
        "_id shiftType",
      );

      let stats = { processed: 0, absent: 0, autoCheckout: 0, onLeave: 0 };

      for (const emp of employees) {
        stats.processed++;

        // Fetch today's attendance record (if exists)
        let attendance = await UserAttendanceModel.findOne({
          employeeId: emp._id,
          date: today,
        });

        // =================================================================
        // SCENARIO A: NO ATTENDANCE RECORD FOUND (Didn't Punch In)
        // =================================================================
        if (!attendance) {
          // A1. Check for Approved Leaves
          const approvedLeave = await LeaveRequestModel.findOne({
            employeeId: emp._id,
            status: { $in: ["Manager Approved", "HR Approved"] },
            fromDate: { $lte: today },
            toDate: { $gte: today },
            isCancelled: false,
          });

          // A2. Determine Status
          let finalStatus = "Absent";
          let remarks = "System Auto-Absent: No Punch Found";
          let workType = "Regular";
          let penaltyApplied = false;
          const rule = SHIFT_RULES[emp.shiftType] || SHIFT_RULES["General"];

          if (approvedLeave) {
            stats.onLeave++;
            finalStatus = "On Leave"; // Default
            remarks = `Approved Leave: ${approvedLeave.leaveType}`;

            if (approvedLeave.requestType.includes("Half")) {
              finalStatus = "Half-Day";
            } else if (approvedLeave.leaveType === "Permission") {
              // Permission but didn't come? Still Absent unless backed by manager
              finalStatus = "Absent";
              remarks = "Absent on Permission Day (No Punch)";
            }
          } else if (isGlobalHoliday) {
            finalStatus = "Holiday"; // Or "Holiday"
            remarks = `Holiday: ${dayStatus.reason}`;
            workType = "Holiday Work"; // Technically they didn't work, but it's a holiday record
          } else {
            stats.absent++;
            penaltyApplied = true;
          }

          // A3. Create the "Absent/Leave" Record
          await UserAttendanceModel.create({
            employeeId: emp._id,
            date: today,
            status: finalStatus,
            remarks: remarks,
            workType: workType,
            shiftConfig: {
              shiftType: rule.type,
              istStartTime: rule.startTime,
              istEndTime: rule.endTime,
            },
            timeline: [],
            sessions: [],
            netWorkHours: 0,
            payroll: {
              isLocked: false,
              penalty: {
                isApplied: penaltyApplied,
                type: penaltyApplied ? "No Pay" : undefined,
                deductionAmount: penaltyApplied ? 1 : 0,
              },
            },
          });
          continue;
        }

        // =================================================================
        // SCENARIO B: RECORD EXISTS (Punched In)
        // =================================================================

        // Skip if already finalized or marked as Leave/Holiday by system earlier
        if (["On Leave", "Absent", "Holiday"].includes(attendance.status))
          continue;

        // B1. MISSING CHECKOUT (Auto-Close)
        if (!attendance.lastOut) {
          // Check for Night Shift: If shift end is tomorrow morning, SKIP this cron
          // (Night shift cron should run at a different time, e.g., 12 PM next day)
          if (attendance.shiftConfig?.isNightShift) {
            console.log(`🌙 Skipping Night Shift Employee: ${emp._id}`);
            continue;
          }

          stats.autoCheckout++;

          // Auto-Checkout Logic
          // We set checkout time to Shift End Time (or Last Punch Time if strict)
          const shiftEndTimeStr = attendance.shiftConfig?.endTime || "18:00";
          const [h, m] = shiftEndTimeStr.split(":").map(Number);
          const autoOutTime = new Date(today);
          autoOutTime.setHours(h, m, 0, 0);

          // Update Timeline
          attendance.timeline.push({
            punchType: "Out",
            timestamp: autoOutTime,
            istTimestamp: getISTTime(autoOutTime),
            location: { lat: 0, lng: 0, address: "System Auto-Checkout" },
            verification: { method: "Manual", confidenceScore: 100 },
            remarks: "System Auto-Checkout (Missed Punch)",
          });

          // Close Open Session
          const openSession = attendance.sessions.find((s) => !s.endTime);
          if (openSession) {
            openSession.endTime = autoOutTime;
            openSession.istEndTime = getISTTime(autoOutTime);
            openSession.durationMins = Math.round(
              (autoOutTime - openSession.startTime) / 60000,
            );
            openSession.isAutoClosed = true;
          }

          attendance.lastOut = autoOutTime;
          attendance.istLastOut = getISTTime(autoOutTime);
          attendance.flags.isAutoCheckOut = true;
          attendance.flags.hasDispute = true; // Flag for HR review
          attendance.remarks = (attendance.remarks || "") + " | Auto-Checkout";
        }

        // B2. FINAL CALCULATIONS (Recalculate Net Hours)
        // Recalculate total duration based on First In / Last Out
        if (attendance.firstIn && attendance.lastOut) {
          attendance.totalDuration = Math.round(
            (attendance.lastOut - attendance.firstIn) / 60000,
          );
        }

        // Recalculate Net Work Hours (Sum of all WORK sessions)
        const workSessions = attendance.sessions.filter(
          (s) => s.type === "Work" && s.endTime,
        );
        const totalWorkMins = workSessions.reduce(
          (acc, s) => acc + (s.durationMins || 0),
          0,
        );

        // Add Permission Hours if applicable
        let effectiveMins = totalWorkMins;
        if (
          attendance.flags.isPermission &&
          attendance.permissionDurationMins
        ) {
          effectiveMins += attendance.permissionDurationMins;
        }

        attendance.netWorkHours = parseFloat((effectiveMins / 60).toFixed(2));

        // B3. DETERMINE FINAL STATUS (Present/Half-Day/Absent)
        // Rules: >8 hrs = Present, >4 hrs = Half-Day, Else Absent
        // (Adjust these thresholds based on your company policy)

        if (attendance.netWorkHours >= 8) {
          attendance.status = "Present";
        } else if (attendance.netWorkHours >= 4) {
          attendance.status = "Half-Day";
          attendance.payroll.penalty = {
            isApplied: true,
            type: "Half-Day Absent",
            deductionAmount: 0.5,
          };
        } else {
          attendance.status = "Absent";
          attendance.remarks = `Insufficient Hours (${attendance.netWorkHours} hrs)`;
          attendance.payroll.penalty = {
            isApplied: true,
            type: "No Pay",
            deductionAmount: 1,
          };
        }

        // B4. OVERTIME CALCULATION
        if (attendance.netWorkHours > 9) {
          attendance.overtimeHours = parseFloat(
            (attendance.netWorkHours - 9).toFixed(2),
          );
          attendance.workType = "Overtime";
        }

        await attendance.save();
      }

      console.log("✅ [CRON] Finalizer Complete. Stats:", stats);
    } catch (err) {
      console.error("❌ [CRON] Job Failed:", err);
    }
  });
};
