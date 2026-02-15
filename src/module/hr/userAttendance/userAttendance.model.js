import mongoose, { Schema } from "mongoose";

const userAttendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    // Normalized Date (Midnight UTC)
    date: { type: Date, required: true },
    istDate: { type: Date },

    // --- 1. Shift Snapshot (Excellent, Keep this) ---
    shiftConfig: {
      shiftType: { type: String, enum: ["Fixed", "Rotational", "Flexible"], default: "Fixed" },
      startTime: { type: String }, // 09:00
      istStartTime: { type: String }, // 09:00
      istEndTime: { type: String },   // 18:00
      endTime: { type: String },   // 18:00
      gracePeriodMins: { type: Number }, 
      breakDurationMins: { type: Number, default: 90 }, // Expected break time
      isNightShift: { type: Boolean, default: false } // Critical for cross-day calculation
    },

    // --- 2. The Timeline (Multi-Punch Support) --- 
    // Captures every single event: In -> Break -> In -> Out
    timeline: [
      {
        punchType: { type: String, enum: ["In", "Out", "BreakStart", "LunchStart", "LunchEnd", "BreakEnd"] },
        timestamp: { type: Date, required: true },
        istTimestamp: { type: Date },
        location: {
          lat: Number,
          lng: Number,
          address: String,
          accuracy: Number, // GPS Accuracy in meters
          isMock: { type: Boolean, default: false } // Android "Mock Location" detection
        },
        device: {
          deviceId: String,
          model: String,
          os: String,
          ip: String
        },
        verification: {
          method: { type: String, enum: ["Geofence", "Face", "Biometric", "Manual"], default: "Geofence" },
          confidenceScore: { type: Number }, // AI Face Match %
          photoUrl: String
        },
        geofenceSiteId: { type: Schema.Types.ObjectId, ref: "Tenders" },
        geofenceId: { type: Schema.Types.ObjectId, ref: "Geofence" },
        remarks: String,
        syncedAt: { type: Date }
      }
    ],

    // --- 3. [NEW] Session Tracking (Processed Intervals) ---
    // This is automatically calculated from the timeline whenever a punch happens.
    // Use this for Payroll/Charts instead of recalculating from timeline every time.
    sessions: [
      {
        startTime: { type: Date }, // e.g., 09:00 AM
        istStartTime: { type: Date },
        endTime: { type: Date },   // e.g., 01:00 PM (Lunch Start)
        istEndTime: { type: Date },
        durationMins: { type: Number, default: 0 }, // 240 mins
        type: { type: String, enum: ["Work", "Break", "Lunch"], default: "Work" },
        isBillable: { type: Boolean, default: true },
        isAutoClosed: { type: Boolean, default: false }, // If system auto-punched out
      }
    ],

    // --- 4. Calculated Summaries (Aggregated from Timeline) ---
    firstIn: { type: Date },  // The very first punch
    istFirstIn: { type: Date },
    lastOut: { type: Date },  // The very last punch
    istLastOut: { type: Date },
    
    totalDuration: { type: Number, default: 0 }, // Raw time between First In and Last Out
    totalBreakTime: { type: Number, default: 0 }, // Time spent in breaks
    permissionDurationMins: { type: Number, default: 0 },
    netWorkHours: { type: Number, default: 0 },   // (Total - Break) -> The "Payroll" hours
    
    overtimeHours: { type: Number, default: 0 },
    workType: { type: String, enum: ["Regular", "Overtime", "Holiday Work"], default: "Regular" },
    
    // --- 5. Status & Compliance ---
    status: {
      type: String,
      enum: ["Present", "Absent", "Half-Day", "On Leave", "Missed Punch","Holiday"],
      default: "Absent",
    },
    remarks: String,
    attendanceType: {
      type: String,
      enum: ["Office", "Remote", "Site", "Hybrid","On Duty","Work From Home"],
      default: "Office"
    },
    
    // Flags for HR Reports
    flags: {
      isLateEntry: { type: Boolean, default: false },
      isEarlyExit: { type: Boolean, default: false },
      isAutoCheckOut: { type: Boolean, default: false }, // System auto-closed the day?
      hasDispute: { type: Boolean, default: false }, // Employee raised a concern?
      isPermission: { type: Boolean, default: false } // Permission Flag
    },

    // --- 6. Regularization (Correction Workflow) ---
    regularization: {
      isApplied: { type: Boolean, default: false },
      status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
      reasonCategory: { type: String, enum: ["Missed Punch", "System Glitch", "Work From Home", "Client Visit","on leave"] },
      userReason: String,
      managerReason: String,
      originalData: { type: Object }, // Backup of data BEFORE correction
      correctedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
      correctedAt: { type: Date }
    },

    // --- 7. Payroll & Locking (Critical for Salary Processing) ---
    payroll: {
      isLocked: { type: Boolean, default: false }, // True once salary is calculated
      batchId: { type: String }, // Link to the Payroll Run ID (e.g., "OCT_2026_BATCH_A")
      processedAt: { type: Date },
      
      // If penalties apply for this specific day
      penalty: {
        isApplied: { type: Boolean, default: false },
        type: { type: String, enum: ["Late Deduction", "Half-Day Absent", "No Pay"] },
        deductionAmount: { type: Number, default: 0 } // e.g., 0.5 days
      }
    },
    // --- 8. Credits & Accruals ---
    // Did working today earn them a leave for later?
    rewards: {
      isCompOffEligible: { type: Boolean, default: false },
      compOffCredit: { type: Number, default: 0 }, // e.g., 1 or 0.5
      expiryDate: { type: Date }, // 30days after the date of attendance
      approvalStatus: { type: String, enum: ["Auto-Approved", "Pending", "Rejected"] }
    },
    // --- 9. Employee Sentiment ---
    sentiment: {
      score: { type: Number, min: 1, max: 5 }, // 1 (Bad) to 5 (Great)
      tags: [{ type: String }], // ["Stressed", "Productive", "Sick"]
      capturedAt: { type: Date }
    }
  },
  { timestamps: true }
);

// ⚡ Performance Indexes
userAttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true }); // Prevent duplicates
userAttendanceSchema.index({ date: 1, status: 1 }); // "Who is absent today?"
userAttendanceSchema.index({ "flags.isLateEntry": 1 }); // "Late comers report"

const UserAttendanceModel = mongoose.model("UserAttendance", userAttendanceSchema);
export default UserAttendanceModel;