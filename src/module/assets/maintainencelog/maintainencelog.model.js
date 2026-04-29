import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// Parts consumed during a service event — links each line back to the bulk
// inventory item so consumption is auditable and stock is decremented.
const PartLineSchema = new Schema(
  {
    item_ref:      { type: Schema.Types.ObjectId, ref: "BulkInventory" },
    item_id_label: String,             // "BLK001" — denormalized for fast read
    item_name:     String,
    quantity:      { type: Number, required: true, min: 0 },
    unit:          String,
    unit_cost:     { type: Number, default: 0, min: 0 },
    total_cost:    { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const LaborLineSchema = new Schema(
  {
    employee_id: String,            // "EMP-001" if internal
    technician_name: String,
    role: String,                    // "Mechanic", "Electrician"
    hours: { type: Number, required: true, min: 0 },
    rate_per_hour: { type: Number, default: 0, min: 0 },
    total_cost: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const MaintenanceLogSchema = new mongoose.Schema(
  {
    maintenance_id: { type: String, unique: true, sparse: true, index: true }, // "MNT001"
    assetId:   { type: String, required: true, index: true },                  // business ID e.g. "EX-01"
    projectId: { type: String, required: true },
    date:      { type: Date, default: Date.now, index: true },

    // Optional link to the originating Work Order (corrective or preventive)
    work_order_ref: { type: Schema.Types.ObjectId, ref: "WorkOrder", default: null, index: true },
    work_order_no:  String,

    category: {
      type: String,
      enum: ["Scheduled Service", "Breakdown Repair", "Spare Parts", "Consumables", "Labor Charge", "Tyre/Battery", "Insurance Claim", "Other"],
      required: true,
    },

    description: { type: String, required: true },
    vendorId:    { type: String, trim: true }, // optional — links to Vendor master
    vendorName:  String,

    // Cost breakdown
    parts:           { type: [PartLineSchema],  default: [] },
    labor:           { type: [LaborLineSchema], default: [] },
    parts_total:     { type: Number, default: 0, min: 0 },
    labor_total:     { type: Number, default: 0, min: 0 },
    other_charges:   { type: Number, default: 0, min: 0 },
    tax_amount:      { type: Number, default: 0, min: 0 },
    amount:          { type: Number, required: true, min: 0 }, // grand total

    invoiceNumber:   String,
    invoice_url:     String,

    // Reliability metrics — captured for MTBF/MTTR rollups
    breakdown_started_at: Date, // for breakdown repairs
    breakdown_ended_at:   Date,
    downtime_hours:       { type: Number, default: 0, min: 0 },

    meterReadingAtService: Number,
    next_service_due_at_reading: Number,
    next_service_due_on:         Date,

    remarks: String,

    // Soft delete + audit
    is_deleted: { type: Boolean, default: false, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

MaintenanceLogSchema.index({ assetId: 1, date: -1 });
MaintenanceLogSchema.index({ category: 1, date: -1 });

MaintenanceLogSchema.plugin(auditPlugin, {
  entity_type: "MaintenanceLog",
  entity_no_field: "maintenance_id",
});

const MaintenanceLog = mongoose.model("MaintenanceLog", MaintenanceLogSchema);
export default MaintenanceLog;
