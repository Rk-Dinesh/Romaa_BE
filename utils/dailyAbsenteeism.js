import cron from "node-cron";
import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import UserAttendanceModel from "../src/module/hr/userAttendance/userAttendance.model.js";
import CalendarService from "../src/module/hr/holidays/holiday.service.js";
import LeaveRequestModel from "../src/module/hr/leave/leaverequest.model.js";

const formatToISTString = (dateObj) => {
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
};

// Run everyday at 23:59 (11:59 PM)
export const startAbsenteeismCron = () => {
  cron.schedule("59 23 * * *", async () => {
    console.log("⏳ Running Daily Attendance Finalizer...");

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    try {
      // 1. Holiday/Weekend Check
      const dayStatus = await CalendarService.checkDayStatus(today);
      if (!dayStatus.isWorkingDay) {
        console.log(
          `☕ Skipping Absenteeism Check: Today is ${dayStatus.reason}`,
        );
        return;
      }

      // 2. Get All Active Employees
      const employees = await EmployeeModel.find({
        status: "Active",
        role: { $ne: null },
      }).select("_id");

      for (const emp of employees) {
        const attendance = await UserAttendanceModel.findOne({
          employeeId: emp._id,
          date: today,
        });

        // --- CASE 1: No Punch Found (Did not come) ---
        if (!attendance) {
          // 🛑 NEW CHECK: Is the employee on APPROVED LEAVE today?
          const approvedLeave = await LeaveRequestModel.findOne({
            employeeId: emp._id,
            status: "Approved",
            fromDate: { $lte: today },
            toDate: { $gte: today },
          });

          if (approvedLeave) {
            // ✅ FOUND LEAVE: Mark as "On Leave" instead of "Absent"
            let leaveStatus = "On Leave";

            // Handle specific leave types from your schema
            if (
              approvedLeave.requestType === "First Half" ||
              approvedLeave.requestType === "Second Half"
            ) {
              leaveStatus = "Half-Day";
            }

            await UserAttendanceModel.create({
              employeeId: emp._id,
              date: today,
              status: leaveStatus,
              remarks: `Approved Leave: ${approvedLeave.leaveType} - ${approvedLeave.reason}`,
              totalWorkingHours: 0,
              // We don't add checkIn/checkOut times for full day leaves
            });

            continue; // Skip to next employee
          }

          // ❌ NO LEAVE FOUND: Mark as "Absent"
          await UserAttendanceModel.create({
            employeeId: emp._id,
            date: today,
            status: "Absent",
            remarks: "System Auto-Absent: No Punch Found",
            totalWorkingHours: 0,
          });
          continue;
        }

        // --- CASE 1.5: Record Exists but is a Placeholder (Auto-Sync) ---
        // If the record exists and status is ALREADY "On Leave" (from LeaveService auto-sync), skip logic.
        if (
          attendance.status === "On Leave" ||
          attendance.status === "Holiday"
        ) {
          continue;
        }

        // --- CASE 2: Checked In BUT Forgot to Check Out ---
        if (
          attendance.checkIn &&
          attendance.checkIn.time &&
          !attendance.checkOut?.time
        ) {
          const shiftEndTimeStr = attendance.shiftConfig?.endTime || "18:00";
          const [endHour, endMin] = shiftEndTimeStr.split(":").map(Number);

          const estimatedCheckOut = new Date(today);
          estimatedCheckOut.setHours(endHour, endMin, 0, 0);

          const checkInTime = new Date(attendance.checkIn.time);

          let calculatedHours = 0;
          if (estimatedCheckOut > checkInTime) {
            const diffMs = estimatedCheckOut - checkInTime;
            calculatedHours = parseFloat(
              (diffMs / (1000 * 60 * 60)).toFixed(2),
            );
          }

          // Penalty Update
          attendance.status = "Absent";
          attendance.totalWorkingHours = calculatedHours;
          attendance.remarks = "System Auto-Absent: Missed Checkout";

          attendance.checkOut = {
            time: estimatedCheckOut,
            timeIST: formatToISTString(estimatedCheckOut),
            location: { lat: 0, lng: 0, address: "System Auto-Checkout" },
            photoUrl: null,
          };

          await attendance.save();
        }
      }
      console.log("✅ Daily Attendance Finalizer Complete.");
    } catch (err) {
      console.error("❌ Job Failed:", err);
    }
  });
};
