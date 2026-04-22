import mongoose from "mongoose";
import { auditPlugin } from "../audit/auditlog.plugin.js";

// ── Approval Request (generic) ──────────────────────────────────────────────
//
// One record per document in the pipeline. Lifecycle:
//   pending  → (each approver signs)  → approved
//   pending  → (any rejects)          → rejected
//   pending  → (initiator withdraws)  → withdrawn
//
// `required_approvers[]` is the resolved list at initiate-time (snapshot of
// the hierarchy result). `rule_snapshot` captures the band used so later
// rule edits don't retroactively change in-flight requests.

const ApprovalLogSchema = new mongoose.Schema(
  {
    action:      { type: String, enum: ["approved", "rejected", "commented", "withdrawn", "escalated"], required: true },
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

    required_approvers: { type: [String], default: [] },
    any_of:             { type: Boolean, default: false },
    approved_by:        { type: [String], default: [] },
    rejected_by:        { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "withdrawn"],
      default: "pending",
    },
    next_approver_id:   { type: String, default: "" },
    initiated_by:       { type: String, required: true },
    completed_at:       { type: Date, default: null },

    approval_log:       { type: [ApprovalLogSchema], default: [] },

    // Snapshot of the band used (so rule edits don't rewrite history)
    rule_snapshot: {
      min_amount:        Number,
      max_amount:        Number,
      label:             String,
      approver_strategy: String,
      roles:             [String],
      levels:            Number,
    },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

ApprovalRequestSchema.index({ source_type: 1, source_ref: 1 }, { unique: true });
ApprovalRequestSchema.index({ status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ next_approver_id: 1, status: 1 });

ApprovalRequestSchema.plugin(auditPlugin, { entity_type: "ApprovalRequest", entity_no_field: "source_no" });

const ApprovalRequestModel =
  mongoose.models.ApprovalRequest || mongoose.model("ApprovalRequest", ApprovalRequestSchema);

export default ApprovalRequestModel;
