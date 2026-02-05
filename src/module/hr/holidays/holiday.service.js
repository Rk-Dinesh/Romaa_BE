import HolidayModel from "./holiday.model.js";

class CalendarService {
  
  // --- 1. ADD HOLIDAY (HR Admin) ---
  static async addHoliday(data) {
    const { date, name, type, description } = data;

    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const exists = await HolidayModel.findOne({ date: targetDate });
    if (exists) {
      throw { statusCode: 409, message: "A holiday already exists on this date." };
    }

    const holiday = new HolidayModel({
      date: targetDate,
      name,
      type,
      description
    });

    await holiday.save();
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
    }).sort({ date: 1 }).select("date _id");

    return holidays;
  }

  // --- 3. CORE CHECK: IS TODAY A WORKING DAY? ---
  // Used by Cron Jobs & Attendance Logic
  static async checkDayStatus(dateInput) {
    const targetDate = new Date(dateInput);
    targetDate.setUTCHours(0, 0, 0, 0);

    // A. Check Weekly Offs (e.g., Sunday)
    // 0 = Sunday, 6 = Saturday
    const dayOfWeek = targetDate.getDay();
    if (dayOfWeek === 0) {
      return { isWorkingDay: false, reason: "Weekly Off (Sunday)" };
    }

    // B. Check Specific Holidays
    const holiday = await HolidayModel.findOne({ date: targetDate });
    if (holiday) {
      return { isWorkingDay: false, reason: holiday.name };
    }

    return { isWorkingDay: true, reason: "Regular Working Day" };
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

  // --- 4. BULK INSERT WITH AUTO-WEEKOFF CALCULATION ---
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