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
}

export default CalendarService;