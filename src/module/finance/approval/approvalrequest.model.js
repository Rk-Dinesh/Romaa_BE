import mongoose from "mongoose";

// ── Approval Request ─────────────────────────────────────────────────────────
//
// One record per document that enters the approval pipeline. Lifecycle:
//   pending  → (each approver signs)  → approved
//   pending  → (any rejects)          → rejected
//   pending  → (initiator withdraws)  → withdrawn
//
// `approval_log[]` captures every action for audit — who, when, verdict,
// comment. Downstream services (PaymentVoucher, PurchaseBill) read the
// request status before moving the underlying document to its own approved
// state.

const ApprovalLogSchema = new mongoose.Schema(
  {
    action:      { type: String, enum: ["approved", "rejected", "commented", "withdrawn"], required: true },
    actor_id:    { type: String, required: true },
    actor_name:  { type: String, default: "" },
    comment:     { type: String, default: "" },
    acted_at:    { type: Date, default: Date.now },
  },
  { _id: false },
);

const ApprovalRequestSchema = new mongoose.Schema(
  {
    source_type:  { type: String, required: true, index: true },
    source_ref:   { type: mongoose.Schema.Types.ObjectId, required: true },
    source_no:    { type: String, default: "" },
    amount:       { type: Number, required: true },
    narration:    { type: String, default: "" },

    required_approvers: { type: [String], default: [] },    // ordered user_ids
    any_of:             { type: Boolean, default: false },
    approved_by:        { type: [String], default: [] },
    rejected_by:        { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "withdrawn"],
      default: "pending",
    },
    next_approver_id:   { type: String, default: "" },      // pointer for convenience
    initiated_by:       { type: String, required: true },
    completed_at:       { type: Date, default: null },

    approval_log:       { type: [ApprovalLogSchema], default: [] },
    rule_snapshot:      {
      min_amount: Number, max_amount: Number, label: String,
    },

    // ── Audit fields ──────────────────────────────────────────────────────
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

ApprovalRequestSchema.index({ source_type: 1, source_ref: 1 }, { unique: true });
ApprovalRequestSchema.index({ status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ next_approver_id: 1, status: 1 });

const ApprovalRequestModel = mongoose.model("ApprovalRequest", ApprovalRequestSchema);
export default ApprovalRequestModel;
