import mongoose, { Schema } from "mongoose";

const userAttendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    date: { type: Date, required: true }, // Midnight UTC

    // --- Shift Snapshot (Locked at Check-In) ---
    // We store this here so if HR changes shift times tomorrow, 
    // today's calculation doesn't break.
    shiftConfig: {
      shiftType: { type: String, enum: ["Morning", "Evening", "Night"], default: "Morning" },
      startTime: { type: String, default: "09:00" }, // HH:mm
      endTime: { type: String, default: "18:00" },   // HH:mm
      gracePeriodMins: { type: Number, default: 30 }, // 9:30 allowed
      halfDayEntryCutoff: { type: String, default: "10:00" }, // After this, morning is absent
      minHalfDayHours: { type: Number, default: 4 }, // 4 hours
      minFullDayHours: { type: Number, default: 7.83 } // 7h 50m approx 7.83 hrs
    },

    // --- Check-In ---
    checkIn: {
      time: { type: Date },
      timeIST: { type: String },
      photoUrl: { type: String },
      visitType: { 
        type: String, 
        enum: ["Regular", "Client Visit", "Work From Home"], 
        default: "Regular" 
      },
      clientName: { type: String },
      location: {
        lat: Number,
        lng: Number,
        address: String,
      },
      isLate: { type: Boolean, default: false }, // True if > 9:30
      lateReason: { type: String } // "4th Late Penalty" or "Time > 10:00"
    },

    // --- Check-Out ---
    checkOut: {
      time: { type: Date },
      timeIST: { type: String },
      photoUrl: { type: String },
      location: {
        lat: Number,
        lng: Number,
        address: String,
      },
    },

    // --- Summaries ---
    totalWorkingHours: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    workType: { type: String, enum: ["Regular", "Overtime", "Holiday Work"], default: "Regular" },

    // The Final Status
    status: {
      type: String,
      enum: ["Present", "Absent", "Half-Day", "On Leave", "Holiday"],
      default: "Absent",
    },

    regularization: {
      status: { 
        type: String, 
        enum: ["None", "Pending", "Approved", "Rejected"], 
        default: "None" 
      },
      reason: { type: String }, // e.g., "Forgot Punch", "System Issue"
      
      // The time they WANT to set
      correctedCheckIn: { type: Date }, 
      correctedCheckOut: { type: Date },
      
      requestedAt: { type: Date },
      actionBy: { type: Schema.Types.ObjectId, ref: "Employee" }, // Manager who approved
      actionDate: { type: Date },
      remarks: { type: String } // Manager's comment
    },

    // Metadata
    isRegularized: { type: Boolean, default: false },
    remarks: { type: String },
  },
  { timestamps: true },
);

// Compound Index for Daily Uniqueness
userAttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

const UserAttendanceModel = mongoose.model("UserAttendance", userAttendanceSchema);
export default UserAttendanceModel;


// "calculate total working hours" even though they missed checkout. Since we don't know when they actually left, the only logical time to stop the clock is the Shift End Time (stored in your shiftConfig.endTime).


// Scenario,Time (Approx),Range,Previous Lates,Result Status,Notes
// Normal,9:15 AM,< 1km,Any,Present,✅ Perfect
// On Duty,9:15 AM,> 10km,Any,Present,"✅ Tagged ""Client Visit"""
// Far Away,9:15 AM,> 1km,Any,Error 403,❌ Check-in Rejected
// Duplicate,Any,Any,Any,Error 409,❌ Already Checked In
// Late 1,9:45 AM,< 1km,0,Present,⚠️ Marked isLate: true
// Late 4,9:45 AM,< 1km,3,Half-Day,⚠️ 3-Late Penalty Triggered
// Too Late,10:15 AM,< 1km,Any,Half-Day,⚠️ Cutoff Time Exceeded