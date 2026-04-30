import HolidayModel from "./holiday.model.js";
import NotificationService from "../../notifications/notification.service.js";
import WeeklyOffPolicyService from "../weeklyOffPolicy/weeklyOffPolicy.service.js";

class CalendarService {
  
  // --- 1. ADD HOLIDAY (HR Admin) ---
  static async addHoliday(data) {
    const { date, name, type, description } = data;

    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const exists = await HolidayModel.findOne({ date: targetDate });
    if (exists) {
      throw { statusCode: 409, message: "A holiday is already registered on this date. Please choose a different date or update the existing entry" };
    }

    const holiday = new HolidayModel({
      date: targetDate,
      name,
      type,
      description
    });

    await holiday.save();

    // Notify all employees about new holiday
    NotificationService.notify({
      title: "Holiday Added",
      message: `${name} on ${targetDate.toLocaleDateString("en-GB")} — ${type || "Holiday"}`,
      audienceType: "common",
      category: "announcement",
      priority: "low",
      module: "hr",
      actionUrl: `/hr/leave`,
      actionLabel: "View Calendar",
    });

    return holiday;
  }

  // --- 2. GET CALENDAR (For Mobile App) ---
  static async getHolidays(year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const holidays = await HolidayModel.find({
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    return holidays;
  }

  static async getHolidaysList(year) {
    const holidays = await HolidayModel.find({
      date: { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31) }
    }).sort({ date: 1 }).select("date _id name");

    return holidays;
  }

  // --- 3. CORE CHECK: IS TODAY A WORKING DAY? ---
  // Used by Cron Jobs & Attendance Logic
  // department (optional) — if provided:
  //   - the per-department WeeklyOffPolicy is consulted (falls back to
  //     "DEFAULT" then to legacy hardcoded Sun + 2nd/4th Sat)
  //   - named holidays scoped via Holiday.applicableDepartments are filtered
  static async checkDayStatus(dateInput, department = null) {
    const targetDate = new Date(dateInput);
    targetDate.setUTCHours(0, 0, 0, 0);

    // A/B. Weekly-off rules — HR-controlled per department.
    const policy = await WeeklyOffPolicyService.resolveForDepartment(department);
    const verdict = WeeklyOffPolicyService.evaluate(targetDate, policy);
    if (verdict.isOff) {
      return { isWorkingDay: false, reason: verdict.reason };
    }

    // C. Named holiday in DB
    const holiday = await HolidayModel.findOne({ date: targetDate });
    if (holiday) {
      const scoped = holiday.applicableDepartments && holiday.applicableDepartments.length > 0;
      if (scoped && department && !holiday.applicableDepartments.includes(department)) {
        // Holiday declared for other departments — this employee still works.
        return { isWorkingDay: true, reason: "Regular Working Day" };
      }
      return { isWorkingDay: false, reason: holiday.name };
    }

    return { isWorkingDay: true, reason: "Regular Working Day" };
  }

  // Batch variant for callers that need to check a date range without
  // running an N+1 query (e.g. LeaveService.applyLeave). Returns a Map
  // of `YYYY-MM-DD` → { isWorkingDay, reason }.
  // Resolves the WeeklyOffPolicy ONCE for the whole range.
  static async checkDayStatusRange(fromDate, toDate, department = null) {
    const start = new Date(fromDate); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(toDate);   end.setUTCHours(0, 0, 0, 0);

    // Single DB call for holidays
    const holidays = await HolidayModel.find({
      date: { $gte: start, $lte: end },
    }).lean();
    const holidayMap = new Map();
    for (const h of holidays) {
      const scoped = h.applicableDepartments && h.applicableDepartments.length > 0;
      if (scoped && department && !h.applicableDepartments.includes(department)) continue;
      holidayMap.set(new Date(h.date).toISOString().split("T")[0], h);
    }

    // Single resolution of the weekly-off policy
    const policy = await WeeklyOffPolicyService.resolveForDepartment(department);

    const result = new Map();
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().split("T")[0];
      const verdict = WeeklyOffPolicyService.evaluate(d, policy);
      if (verdict.isOff) {
        result.set(key, { isWorkingDay: false, reason: verdict.reason });
      } else if (holidayMap.has(key)) {
        result.set(key, { isWorkingDay: false, reason: holidayMap.get(key).name });
      } else {
        result.set(key, { isWorkingDay: true, reason: "Regular Working Day" });
      }
    }
    return result;
  }

  // --- 4a. DELETE HOLIDAY ---
  static async deleteHoliday(id) {
    const holiday = await HolidayModel.findByIdAndDelete(id);
    if (!holiday) throw { statusCode: 404, message: "Holiday not found" };
    return holiday;
  }

  // --- 4b. UPDATE HOLIDAY ---
  static async updateHoliday(id, data) {
    const { date, name, type, description } = data;
    const update = {};
    if (name)        update.name = name;
    if (type)        update.type = type;
    if (description) update.description = description;
    if (date) {
      const d = new Date(date);
      d.setUTCHours(0, 0, 0, 0);
      // Check for collision with another document
      const clash = await HolidayModel.findOne({ date: d, _id: { $ne: id } });
      if (clash) throw { statusCode: 409, message: "Another holiday already exists on that date" };
      update.date = d;
    }
    const updated = await HolidayModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!updated) throw { statusCode: 404, message: "Holiday not found" };
    return updated;
  }

static isSecondOrFourthSaturday(dateObj) {
    const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat
    if (dayOfWeek !== 6) return false;

    const dayOfMonth = dateObj.getDate();
    // Logic: 
    // 1st Sat: 1-7, 2nd Sat: 8-14, 3rd Sat: 15-21, 4th Sat: 22-28, 5th Sat: 29-31
    const weekNumber = Math.ceil(dayOfMonth / 7);
    
    return weekNumber === 2 || weekNumber === 4;
  }

  // --- 5. BULK INSERT WITH AUTO-WEEKOFF CALCULATION ---
static async bulkInsertHolidaysFromCsv(csvRows) {
    // We use a Map to ensure unique dates (Key: Date Timestamp)
    const operationsMap = new Map(); 
    const errors = [];
    const yearsProcessed = new Set(); // Track years found in CSV (e.g., 2026)

    // ---------------------------------------------------------
    // STEP 1: Process CSV Rows
    // ---------------------------------------------------------
    for (const row of csvRows) {
      const dateString = row.DATE || row.date;
      if (!dateString) continue;

      const parsedDate = new Date(dateString);
      if (isNaN(parsedDate.getTime())) {
        errors.push({ row, message: "Invalid Date Format" });
        continue;
      }

      // Normalize to UTC Midnight
      parsedDate.setUTCHours(0, 0, 0, 0);
      
      // Track the year so we can auto-fill weekends for it later
      yearsProcessed.add(parsedDate.getUTCFullYear());

      // Define Values
      let name = row.NAME || row.name;
      let type = row.TYPE || row.type || "National";
      let description = row.DESCRIPTION || row.description || "";

      // Logic: Override if it falls on a Weekend
      const dayOfWeek = parsedDate.getUTCDay();

      if (dayOfWeek === 0) { // Sunday
        name = "Weekly Off";
        type = "Weekend";
        description = "Sunday";
      } else if (this.isSecondOrFourthSaturday(parsedDate)) {
        name = "Weekly Off";
        type = "Weekend";
        description = "2nd/4th Saturday";
      }

      // Add to Map
      operationsMap.set(parsedDate.getTime(), {
        updateOne: {
          filter: { date: parsedDate },
          update: { $set: { date: parsedDate, name, type, description } },
          upsert: true
        }
      });
    }

    // ---------------------------------------------------------
    // STEP 2: Auto-Fill Missing Weekends for Identified Years
    // ---------------------------------------------------------
    for (const year of yearsProcessed) {
      const startDate = new Date(Date.UTC(year, 0, 1)); // Jan 1
      const endDate = new Date(Date.UTC(year, 11, 31)); // Dec 31

      // Loop through every day of the year
      for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        
        const currentDate = new Date(d);
        const timeKey = currentDate.getTime();

        // If this date is ALREADY in the Map (from CSV), skip it
        if (operationsMap.has(timeKey)) continue;

        // Check if it is a Weekend
        let isWeekend = false;
        let desc = "";

        if (currentDate.getUTCDay() === 0) {
          isWeekend = true;
          desc = "Sunday";
        } else if (this.isSecondOrFourthSaturday(currentDate)) {
          isWeekend = true;
          desc = "2nd/4th Saturday";
        }

        // If it is a missing weekend, add it to operations
        if (isWeekend) {
          operationsMap.set(timeKey, {
            updateOne: {
              filter: { date: currentDate },
              update: {
                $set: {
                  date: currentDate,
                  name: "Weekly Off",
                  type: "Weekend",
                  description: desc
                }
              },
              upsert: true
            }
          });
        }
      }
    }

    // ---------------------------------------------------------
    // STEP 3: Execute All Operations
    // ---------------------------------------------------------
    const operations = Array.from(operationsMap.values());
    let result = {};
    
    if (operations.length > 0) {
      result = await HolidayModel.bulkWrite(operations);
    }

    return {
      totalProcessed: operations.length, // Includes CSV + Auto-filled Weekends
      successCount: (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0),
      failedCount: errors.length,
      errors: errors
    };
  }

}

export default CalendarService;