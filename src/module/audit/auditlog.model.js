import mongoose from "mongoose";

// ── App Audit Log ────────────────────────────────────────────────────────────
//
// App-wide audit trail for every state change OUTSIDE the finance module.
// Finance has its own collection (`finance_audit_logs`) for retention &
// compliance reasons — do NOT merge them.
//
// Shape mirrors finance_audit_logs on purpose so the same UI components can
// read either collection.

const AppAuditLogSchema = new mongoose.Schema(
  {
    entity_type:    { type: String, required: true, index: true }, // "LeaveRequest", "Tender", "Role", ...
    entity_id:      { type: mongoose.Schema.Types.ObjectId, index: true },
    entity_no:      { type: String, default: "" },                 // human-readable biz code (EMP-001, TND-012)
    action:         { type: String, required: true, index: true }, // create | update | delete | approve | reject | other
    actor_id:       { type: mongoose.Schema.Types.ObjectId, ref: "Employee", index: true },
    actor_name:     { type: String, default: "" },
    changes:        { type: mongoose.Schema.Types.Mixed },         // { field: { from, to } }
    meta:           { type: mongoose.Schema.Types.Mixed },         // free-form context
    correlation_id: { type: String, default: "" },
    ip_address:     { type: String, default: "" },
    tenant_id:      { type: String, default: "" },                 // forward-compat for SaaS phase
  },
  {
    timestamps: true,
    collection: "app_audit_logs",
  },
);

// Compound indexes aligned to the read patterns surfaced in the UI:
AppAuditLogSchema.index({ entity_type: 1, entity_id: 1, createdAt: -1 });
AppAuditLogSchema.index({ actor_id: 1, createdAt: -1 });
AppAuditLogSchema.index({ action: 1, createdAt: -1 });
AppAuditLogSchema.index({ entity_type: 1, action: 1, createdAt: -1 });

const AppAuditLogModel =
  mongoose.models.AppAuditLog || mongoose.model("AppAuditLog", AppAuditLogSchema);

export default AppAuditLogModel;
