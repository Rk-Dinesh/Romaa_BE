import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema({
  entity_type:  { type: String, required: true, index: true }, // "PurchaseBill", "JournalEntry", "Approval"
  entity_id:    { type: mongoose.Schema.Types.ObjectId, index: true },
  entity_no:    { type: String, default: "" },                  // human-readable doc number
  action:       { type: String, required: true, index: true },  // "create", "update", "approve", "reject", "delete", "import"
  actor_id:     { type: mongoose.Schema.Types.ObjectId, ref: "Employee", index: true },
  actor_name:   { type: String, default: "" },
  changes:      { type: mongoose.Schema.Types.Mixed },          // { field: { from, to } } or null
  meta:         { type: mongoose.Schema.Types.Mixed },          // additional context (fin_year, tender_id, amount)
  correlation_id: { type: String, default: "" },
  ip_address:   { type: String, default: "" },
}, {
  timestamps: true,
  collection: "finance_audit_logs",
});

// Compound index for common queries: "show all approvals for entity X"
AuditLogSchema.index({ entity_type: 1, entity_id: 1, createdAt: -1 });
// Actor audit trail: "show all actions by actor Y in FY"
AuditLogSchema.index({ actor_id: 1, createdAt: -1 });
// Action log: "show all approvals in date range"
AuditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLogModel = mongoose.model("FinanceAuditLog", AuditLogSchema);
export default AuditLogModel;
