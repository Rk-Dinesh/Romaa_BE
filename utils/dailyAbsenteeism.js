import cron from "node-cron";
import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import UserAttendanceModel from "../src/module/hr/userAttendance/userAttendance.model.js";
import CalendarService from "../src/module/hr/holidays/holiday.service.js";

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
  }

// Run everyday at 23:59 (11:59 PM)
cron.schedule("59 23 * * *", async () => {
  console.log("⏳ Running Daily Attendance Finalizer...");
  
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    // 1. Get all Active Employees

    const dayStatus = await CalendarService.checkDayStatus(today);
    // If it is NOT a working day (Sunday/Holiday), STOP the script.
    if (!dayStatus.isWorkingDay) {
      console.log(`☕ Skipping Absenteeism Check: Today is ${dayStatus.reason}`);
      return; 
    }
    const employees = await EmployeeModel.find({ status: "Active" ,role:{$ne:null}}).select("_id");

    for (const emp of employees) {
      const attendance = await UserAttendanceModel.findOne({
        employeeId: emp._id,
        date: today
      });

      // --- CASE 1: No Punch Found (Did not come) ---
      if (!attendance) {
        await UserAttendanceModel.create({
          employeeId: emp._id,
          date: today,
          status: "Absent",
          remarks: "System Auto-Absent: No Punch Found",
          totalWorkingHours: 0
        });
        continue; // Skip to next employee
      }

      // --- CASE 2: Checked In BUT Forgot to Check Out ---
      // We check if checkIn time exists, but checkOut time is missing
      if (attendance.checkIn && attendance.checkIn.time && !attendance.checkOut?.time) {
        
        // Option A: Set hours to 0 (Standard strict policy)
        // const calculatedHours = 0; 

        // Option B: Calculate hours assuming they worked until Shift End (e.g., 18:00)
        // This gives them "credit" for hours but marks Absent as a penalty.
        const shiftEndTimeStr = attendance.shiftConfig?.endTime || "18:00";
        const [endHour, endMin] = shiftEndTimeStr.split(":").map(Number);
        
        const estimatedCheckOut = new Date(today);
        estimatedCheckOut.setHours(endHour, endMin, 0, 0);

        const checkInTime = new Date(attendance.checkIn.time);
        
        // Safety: If check-in was AFTER shift end, hours are 0
        let calculatedHours = 0;
        if (estimatedCheckOut > checkInTime) {
          const diffMs = estimatedCheckOut - checkInTime;
          calculatedHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
        }

        // Update the record
        attendance.status = "Absent"; // Penalty for missing punch
        attendance.totalWorkingHours = calculatedHours;
        attendance.remarks = "System Auto-Absent: Missed Checkout";
        
        // We technically perform an "Auto Checkout" at shift end time
        attendance.checkOut = {
          time: estimatedCheckOut,
          timeIST: formatToISTString(estimatedCheckOut),
          location: { lat: 0, lng: 0, address: "System Auto-Checkout" },
          photoUrl: null
        };

        await attendance.save();
      }
    }
    console.log("✅ Daily Attendance Finalizer Complete.");
  } catch (err) {
    console.error("❌ Job Failed:", err);
  }
});