import mongoose, { Schema } from "mongoose";

// Tracks every mutation to an employee's leave balance.
// Written by: leave approval, cancellation, year-end reset, manual HR adjustment.
const leaveBalanceHistorySchema = new mongoose.Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    leaveType: {
      type: String,
      enum: ["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement", "CompOff", "LWP"],
      required: true,
    },

    // Direction of the change
    changeType: {
      type: String,
      enum: [
        "Debit",         // Leave approved — balance reduced
        "Credit",        // Leave cancelled / refund — balance restored
        "Reset",         // Year-end reset to entitlement
        "CarryForward",  // PL carried into new year
        "Expiry",        // CompOff credits expired
        "ManualAdjust",  // HR manually corrected balance
      ],
      required: true,
    },

    amount: { type: Number, required: true }, // Always positive; direction from changeType

    balanceBefore: { type: Number, required: true },
    balanceAfter:  { type: Number, required: true },

    reason: { type: String, required: true }, // e.g. "Annual Reset 2026", "Leave Approved: LR-001"

    // Optional back-reference to the leave request that caused this change
    leaveRequestId: {
      type: Schema.Types.ObjectId,
      ref: "LeaveRequest",
      default: null,
    },

    // Who triggered this — null means a system cron job
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
  },
  { timestamps: true }
);

leaveBalanceHistorySchema.index({ employeeId: 1, leaveType: 1, createdAt: -1 });
leaveBalanceHistorySchema.index({ employeeId: 1, createdAt: -1 });

const LeaveBalanceHistoryModel = mongoose.model("LeaveBalanceHistory", leaveBalanceHistorySchema);
export default LeaveBalanceHistoryModel;
