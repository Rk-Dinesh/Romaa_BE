import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// Encashment voucher emitted when carry-forward cap is exceeded at year-end
// for an `encashable: true` rule. Picked up by payroll for payout.
const LeaveEncashmentSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    leaveType:  { type: String, required: true },
    days:       { type: Number, required: true, min: 0 },
    rate:       { type: Number, default: 0 },        // ₹ per day
    amount:     { type: Number, default: 0 },        // days * rate (rounded)
    basis:      { type: String, enum: ["BASIC", "GROSS", "FIXED"], default: "BASIC" },
    payrollMonth: { type: Number },
    payrollYear:  { type: Number },
    status: { type: String, enum: ["Pending", "Paid", "Cancelled"], default: "Pending", index: true },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);

LeaveEncashmentSchema.index({ employeeId: 1, payrollYear: -1, payrollMonth: -1 });

LeaveEncashmentSchema.plugin(auditPlugin, { entity_type: "LeaveEncashment" });

const LeaveEncashmentModel = mongoose.model("LeaveEncashment", LeaveEncashmentSchema);
export default LeaveEncashmentModel;
