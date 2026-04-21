import mongoose from "mongoose";

// ── Approval Rule ────────────────────────────────────────────────────────────
//
// Threshold-based, multi-level approval policy. Each rule is keyed by
// `source_type` (e.g. "PaymentVoucher", "PurchaseBill", "WeeklyBilling",
// "ExpenseVoucher", "ClientBilling", "BankTransfer"). A request triggers the
// rule whose `[min, max]` band contains the document's amount, and the
// `approvers[]` (ordered user_ids) must all sign off.

const ThresholdSchema = new mongoose.Schema(
  {
    min_amount:   { type: Number, required: true },           // inclusive
    max_amount:   { type: Number, default: Number.MAX_SAFE_INTEGER }, // inclusive; null/large = "no upper bound"
    approvers:    { type: [String], default: [] },            // ordered user_ids (Employee._id as string)
    any_of:       { type: Boolean, default: false },          // true = any approver suffices; false = all
    label:        { type: String, default: "" },              // e.g. "Level 1: Manager, Level 2: CFO"
  },
  { _id: false },
);

const ApprovalRuleSchema = new mongoose.Schema(
  {
    source_type:  { type: String, required: true, index: true },
    thresholds:   { type: [ThresholdSchema], default: [] },
    is_active:    { type: Boolean, default: true },
    created_by:   { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by:   { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted:   { type: Boolean, default: false },
  },
  { timestamps: true },
);

ApprovalRuleSchema.index({ source_type: 1, is_active: 1 });

const ApprovalRuleModel = mongoose.model("ApprovalRule", ApprovalRuleSchema);
export default ApprovalRuleModel;
