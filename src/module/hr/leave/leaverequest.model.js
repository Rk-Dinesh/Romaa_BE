import mongoose, { Schema } from "mongoose";

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    // --- Core Leave Details ---
    leaveType: {
      type: String,
      enum: ["CL", "SL", "PL", "LWP", "CompOff", "Maternity", "Paternity", "Bereavement", "Permission"],
      required: true,
    },
    
    // Distinguish Full Day vs Half Day vs Short Leave
    requestType: {
      type: String,
      enum: ["Full Day", "First Half", "Second Half", "Short Leave"],
      default: "Full Day"
    },

    // Normalized Dates (Midnight UTC recommended)
    fromDate: { type: Date, required: true }, 
    toDate: { type: Date, required: true },   
    
    // Specifics for Short Leave (e.g., 3 hours permission)
    shortLeaveTime: {
        from: { type: String }, // e.g. "10:00"
        to: { type: String }    // e.g. "13:00"
    },

    totalDays: {
      type: Number,
      required: true, // 0.5, 1, 3, etc.
    },

    // --- NEW: Holiday/Weekend Tracking ---
    // Stores the exact reason for any non-working days in the range
    nonWorkingDays: [
      {
        date: { type: Date },
        reason: { type: String } // e.g., "Sunday", "Public Holiday: Diwali"
      }
    ],

    reason: { type: String, required: true },
    
    // Optional: Proof for Sick Leaves
    attachmentUrl: { type: String, default: null }, 

    // --- Work Handover (Critical for Operations) ---
    coveringEmployeeId: {
        type: Schema.Types.ObjectId, 
        ref: "Employee",
        default: null // The person handling duties while applicant is away
    },

    // --- Workflow Status ---
    status: {
      type: String,
      enum: ["Pending", "Manager Approved", "HR Approved", "Rejected", "Cancelled", "Revoked"],
      default: "Pending",
    },

    // --- Audit Trail (Futuristic) ---
    // Tracks the lifecycle: Applied -> Manager OK -> HR OK
    workflowLogs: [
      {
        action: { type: String, enum: ["Applied", "Approved", "Rejected", "Cancelled"] },
        actionBy: { type: Schema.Types.ObjectId, ref: "Employee" }, // User ID or Manager ID
        actionDate: { type: Date, default: Date.now },
        remarks: { type: String }, // e.g., "Approved, but ensure site handover."
        role: { type: String } // "Employee", "Manager", "HR"
      }
    ],

    // --- Final Metadata (For quick reporting) ---
    finalApprovedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    finalApprovalDate: { type: Date, default: null },
    rejectionReason: { type: String, default: null },

    // --- Cancellation (Post-Approval) ---
    isCancelled: { type: Boolean, default: false },
    cancellationReason: { type: String },
    cancelledAt: { type: Date },

  },
  { timestamps: true }
);

// Indexes for performance
leaveRequestSchema.index({ employeeId: 1, status: 1 }); // "My Pending Leaves"
leaveRequestSchema.index({ status: 1, fromDate: 1 });   // "HR Dashboard: Who is on leave today?"
leaveRequestSchema.index({ fromDate: 1, toDate: 1 });   // Overlap checks

const LeaveRequestModel = mongoose.model("LeaveRequest", leaveRequestSchema);

export default LeaveRequestModel;