import mongoose from "mongoose";
import { auditPlugin } from "../audit/auditlog.plugin.js";

// ── Approval Rule (generic, module-agnostic) ────────────────────────────────
//
// One rule per `source_type` (e.g. "LeaveRequest", "PurchaseOrder",
// "PaymentVoucher"). The document's amount-like field is matched against the
// band's [min_amount, max_amount]. Approvers are resolved per-band via one of
// four strategies — USERS / ROLE / REPORTS_TO / DEPARTMENT_HEAD.
//
// Legacy rules written by the finance-only engine had only `approvers[]`. They
// remain valid: `approver_strategy` defaults to "USERS" so pre-existing data
// flows through the same code path unchanged.

export const APPROVER_STRATEGY = Object.freeze({
  USERS:            "USERS",             // explicit employee _ids in approvers[]
  ROLE:             "ROLE",              // any current holder of roles[]
  REPORTS_TO:       "REPORTS_TO",        // walk initiator.reportsTo N levels
  DEPARTMENT_HEAD:  "DEPARTMENT_HEAD",   // resolve head of initiator.department
});

const ThresholdSchema = new mongoose.Schema(
  {
    min_amount:   { type: Number, required: true },                    // inclusive
    max_amount:   { type: Number, default: Number.MAX_SAFE_INTEGER },  // inclusive

    approver_strategy: {
      type: String,
      enum: Object.values(APPROVER_STRATEGY),
      default: APPROVER_STRATEGY.USERS,
    },

    // Used when strategy = USERS — ordered employee _ids (string form).
    approvers: { type: [String], default: [] },

    // Used when strategy = ROLE — role names matched against Role.roleName.
    roles: { type: [String], default: [] },

    // Used when strategy = REPORTS_TO — how many manager hops to walk.
    levels: { type: Number, default: 1 },

    any_of: { type: Boolean, default: false },   // true = first approver suffices
    label:  { type: String,  default: "" },      // human-readable, shown in UI
  },
  { _id: false },
);

const ApprovalRuleSchema = new mongoose.Schema(
  {
    source_type:  { type: String, required: true, index: true },

    // Optional metadata for the Settings UI.
    module_label: { type: String, default: "" },      // e.g. "HR › Leave"
    amount_field: { type: String, default: "amount" },// what we compare: "amount"|"days"|"qty"

    thresholds:   { type: [ThresholdSchema], default: [] },
    is_active:    { type: Boolean, default: true },

    created_by:   { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by:   { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted:   { type: Boolean, default: false },
  },
  { timestamps: true },
);

ApprovalRuleSchema.index({ source_type: 1, is_active: 1 });

ApprovalRuleSchema.plugin(auditPlugin, { entity_type: "ApprovalRule", entity_no_field: "source_type" });

const ApprovalRuleModel =
  mongoose.models.ApprovalRule || mongoose.model("ApprovalRule", ApprovalRuleSchema);

export default ApprovalRuleModel;

