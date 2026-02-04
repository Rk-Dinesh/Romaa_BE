import mongoose, { Schema } from "mongoose";

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: { 
      type: Schema.Types.ObjectId, 
      ref: "Employee", 
      required: true, 
      index: true 
    },

    // --- Leave Details ---
    leaveType: { 
      type: String, 
      enum: ["CL", "SL", "PL", "LWP"], // Casual, Sick, Privilege, Leave Without Pay
      required: true 
    },
    fromDate: { 
      type: Date, 
      required: true 
    },
    toDate: { 
      type: Date, 
      required: true 
    },
    totalDays: { 
      type: Number, 
      required: true // Handles half-days as 0.5
    },
    reason: { 
      type: String, 
      required: true 
    },

    // Optional: Proof for Sick Leaves > 2 days
    attachmentUrl: { 
      type: String, 
      default: null // AWS S3/Cloudinary link to medical certificate
    }, 

    // --- Workflow & Approval ---
    status: { 
      type: String, 
      enum: ["Pending", "Approved", "Rejected", "Cancelled"], 
      default: "Pending" 
    },
    
    // Who approved/rejected it? (Usually their Manager)
    approvedBy: { 
      type: Schema.Types.ObjectId, 
      ref: "Employee", 
      default: null 
    },
    
    // Manager's feedback if rejected
    managerRemarks: { 
      type: String, 
      default: null 
    },

    approvalDate: { 
      type: Date, 
      default: null 
    }
  },
  { timestamps: true }
);

// Index for HR Dashboard queries (e.g., "Show all pending leaves this month")
leaveRequestSchema.index({ status: 1, fromDate: 1 });

const LeaveRequestModel = mongoose.model("LeaveRequest", leaveRequestSchema);

export default LeaveRequestModel;



// How it works in the HRMS System:
// Mobile App: Employee selects dates, leave type, and submits. totalDays is calculated on the frontend (excluding Sundays/Holidays).

// Notification: Backend checks the employee.reportsTo field and sends a push notification to their Manager.

// Manager Action: Manager views the request.

// If Approved: Backend reduces the leaveBalance in the Employee schema and updates approvedBy.

// If Rejected: Manager enters managerRemarks and status changes to "Rejected".

// Attendance Link: A Cron job (background task) runs daily at midnight. If an employee has an "Approved" leave for today, it automatically marks their Attendance as "On Leave", so they don't get marked "Absent".