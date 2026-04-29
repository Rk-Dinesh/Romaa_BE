import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// WorkOrder — the unit of repair / preventive-maintenance work on an asset.
// Lifecycle:  DRAFT → APPROVED → IN_PROGRESS → COMPLETED → CLOSED
//                                               ↘ CANCELLED
// On CLOSED, the service auto-posts a MaintenanceLog row from the captured
// parts/labor/cost so the maintenance ledger and the work-order history stay
// in lockstep.
//
// `kind = PM` orders are created by the PM scheduler service when a PM plan
// fires; `kind = CORRECTIVE` orders are raised manually by site supervisors
// when a breakdown happens; `kind = INSPECTION_REMEDIATION` orders come from
// inspection-checklist failures.

const PartLineSchema = new Schema(
  {
    item_ref:      { type: Schema.Types.ObjectId, ref: "BulkInventory" },
    item_id_label: String,
    item_name:     String,
    quantity_planned: { type: Number, default: 0, min: 0 },
    quantity_used:    { type: Number, default: 0, min: 0 },
    unit:             String,
    unit_cost:        { type: Number, default: 0, min: 0 },
    total_cost:       { type: Number, default: 0, min: 0 },
    issued_txn_ref:   { type: Schema.Types.ObjectId, ref: "BulkInventoryTransaction", default: null },
  },
  { _id: false }
);

const LaborLineSchema = new Schema(
  {
    employee_id:     String,
    technician_name: String,
    role:            String,
    hours:           { type: Number, default: 0, min: 0 },
    rate_per_hour:   { type: Number, default: 0, min: 0 },
    total_cost:      { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const StatusEventSchema = new Schema(
  {
    from_status: String,
    to_status:   String,
    by_employee: { type: Schema.Types.ObjectId, ref: "Employee" },
    at:          { type: Date, default: Date.now },
    notes:       String,
  },
  { _id: false }
);

const WorkOrderSchema = new mongoose.Schema(
  {
    work_order_no: { type: String, required: true, unique: true, index: true }, // "WO001"

    // Asset link
    asset_ref: { type: Schema.Types.ObjectId, ref: "MachineryAsset", required: true, index: true },
    assetId:   { type: String, required: true, index: true },
    asset_name: String,
    projectId: { type: String, index: true },

    kind: {
      type: String,
      enum: ["PM", "CORRECTIVE", "INSPECTION_REMEDIATION", "ACCIDENT", "OTHER"],
      required: true,
      index: true,
    },
    title:       { type: String, required: true, trim: true },
    description: String,

    priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM", index: true },

    // Origin trace
    pm_plan_ref:  { type: Schema.Types.ObjectId, ref: "PmPlan", default: null, index: true },
    inspection_ref: { type: Schema.Types.ObjectId, ref: "AssetInspection", default: null },

    // Status machine
    status: {
      type: String,
      enum: ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CLOSED", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },
    statusHistory: { type: [StatusEventSchema], default: [] },

    // Timestamps for KPIs
    raised_at:   { type: Date, default: Date.now, index: true },
    approved_at: Date,
    started_at:  Date,
    completed_at:Date,
    closed_at:   Date,

    // Reading at start/end — used for PM closure and downtime calcs
    reading_at_start: Number,
    reading_at_end:   Number,
    downtime_hours:   { type: Number, default: 0, min: 0 },

    // Costing
    parts:           { type: [PartLineSchema],  default: [] },
    labor:           { type: [LaborLineSchema], default: [] },
    parts_total:     { type: Number, default: 0, min: 0 },
    labor_total:     { type: Number, default: 0, min: 0 },
    other_charges:   { type: Number, default: 0, min: 0 },
    tax_amount:      { type: Number, default: 0, min: 0 },
    estimated_cost:  { type: Number, default: 0, min: 0 },
    actual_cost:     { type: Number, default: 0, min: 0 },

    vendorId: String,
    vendorName: String,
    invoiceNumber: String,
    invoice_url: String,

    // Approval (uses generic approval engine)
    approval_request_id: { type: Schema.Types.ObjectId, ref: "ApprovalRequest", default: null },

    // Cross-link to the auto-posted maintenance log row
    maintenance_log_ref: { type: Schema.Types.ObjectId, ref: "MaintenanceLog", default: null },

    assigned_to_employee_id:   String,
    assigned_to_employee_name: String,

    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

WorkOrderSchema.index({ assetId: 1, status: 1 });
WorkOrderSchema.index({ status: 1, raised_at: -1 });
WorkOrderSchema.index({ projectId: 1, status: 1 });

WorkOrderSchema.plugin(auditPlugin, { entity_type: "WorkOrder", entity_no_field: "work_order_no" });

const WorkOrderModel = mongoose.model("WorkOrder", WorkOrderSchema);
export default WorkOrderModel;
