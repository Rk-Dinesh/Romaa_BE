import mongoose, { Schema } from "mongoose";

const UserAttendanceSchema = new mongoose.Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true }, // Store as YYYY-MM-DD (midnight)
    
    status: { 
      type: String, 
      enum: ["Present", "Absent", "Leave", "Half-Day"], 
      default: "Absent" 
    },
    
    // For Office Staff (Punch In/Out)
    checkInTime: Date,
    checkOutTime: Date,
    
    // Location Validation
    location: {
      lat: Number,
      lng: Number,
      address: String
    },
    
    remarks: String
  },
  { timestamps: true }
);

// Ensure a user can only have one attendance record per day
UserAttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export const UserAttendance = mongoose.model("UserAttendance", UserAttendanceSchema);