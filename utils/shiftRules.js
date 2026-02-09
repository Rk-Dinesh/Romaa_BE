export const SHIFT_RULES = {
  // 1. Standard Day Shift (Fixed)
  // Logic: Late if after 09:15. Half-day if after 13:00.
  General: {
    code: "GS-01",
    type: "Fixed",
    startTime: "09:00",
    endTime: "18:00",
    gracePeriodMins: 15,    // Allowed until 09:15
    breakDurationMins: 60,  // Lunch Break
    isNightShift: false,    // Ends same day
    minHalfDayHours: 4,     // If worked < 4 hrs -> Absent
    minFullDayHours: 8,     // If worked < 8 hrs -> Half Day
    halfDayCutoff: "13:00"  // If punch-in after 13:00 -> Half Day
  },

  // 2. Evening/Swing Shift (Fixed)
  // Logic: Late if after 14:30.
  Evening: {
    code: "ES-01",
    type: "Fixed",
    startTime: "14:00",
    endTime: "23:00",
    gracePeriodMins: 30,    // Allowed until 14:30
    breakDurationMins: 45,
    isNightShift: false,    // Ends same day (just before midnight)
    minHalfDayHours: 4,
    minFullDayHours: 8,
    halfDayCutoff: "18:00"
  },

  // 3. Night Shift (Rotational / Cross-Day)
  // Logic: Starts today, ends tomorrow.
  Night: {
    code: "NS-01",
    type: "Rotational",
    startTime: "22:00",     // 10:00 PM
    endTime: "07:00",       // 07:00 AM (Next Day)
    gracePeriodMins: 30,    // Allowed until 22:30
    breakDurationMins: 60,
    isNightShift: true,     // <--- CRITICAL: Tells system to look at next date for checkout
    minHalfDayHours: 4.5,
    minFullDayHours: 8,
    halfDayCutoff: "02:00"  // 2 AM is the half-way point
  },

  // 4. Flexible / Startup Mode
  // Logic: No strict "Late". Just finish 9 hours total.
  Flexi: {
    code: "FLX-01",
    type: "Flexible",
    startTime: "08:00",     // Office opens
    endTime: "21:00",       // Office closes
    gracePeriodMins: 0,     // No concept of "Late" arrival
    breakDurationMins: 60,
    isNightShift: false,
    minHalfDayHours: 4.5,   // Minimum effort for half pay
    minFullDayHours: 9,     // Target duration
    coreHours: { start: "11:00", end: "16:00" } // Must be present
  }
};