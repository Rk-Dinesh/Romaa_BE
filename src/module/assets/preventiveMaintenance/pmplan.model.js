import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// PM Plan — defines a recurring preventive-maintenance trigger for a machine.
// One asset can have many plans (e.g. "Engine oil every 250 hrs",
// "Hydraulic filter every 500 hrs", "Annual fitness check"). The PM scheduler
// service polls these plans and auto-creates a Work Order whenever any
// trigger threshold is reached.
//
// Triggers are evaluated as "any of":
//   - meter:    asset.lastReading - lastTriggeredAtReading >= intervalReading
//   - calendar: now - lastTriggeredAt >= intervalDays
// If both are set, whichever fires first wins (industry standard).

const PartTemplateSchema = new Schema(
  {
    item_ref:      { type: Schema.Types.ObjectId, ref: "BulkInventory" },
    item_id_label: String,
    item_name:     String,
    quantity:      { type: Number, required: true, min: 0 },
    unit:          String,
  },
  { _id: false }
);

const PmPlanSchema = new mongoose.Schema(
  {
    pm_plan_id: { type: String, required: true, unique: true, index: true }, // "PMP001"

    // Asset link — supports custom string ID for back-compat with logs
    asset_ref:    { type: Schema.Types.ObjectId, ref: "MachineryAsset", required: true, index: true },
    assetId:      { type: String, required: true, index: true }, // "EX-01"
    asset_name:   String,
    asset_class:  String,

    name:        { type: String, required: true, trim: true }, // "250-hr Engine Oil & Filter"
    description: String,

    // Trigger thresholds — at least one must be set
    triggerType: {
      type: String,
      enum: ["METER", "CALENDAR", "BOTH"],
      required: true,
    },
    intervalReading: { type: Number, min: 1 },  // every N hours/kms
    intervalDays:    { type: Number, min: 1 },  // every N calendar days

    // Where it tracks — last trigger fixes the next due
    lastTriggeredAt:        { type: Date, default: null },
    lastTriggeredAtReading: { type: Number, default: null },
    nextDueAt:              { type: Date, default: null, index: true },
    nextDueAtReading:       { type: Number, default: null },

    // Lead time before due — when to surface in the "due soon" report
    leadTimeDays:    { type: Number, default: 7, min: 0 },
    leadTimeReading: { type: Number, default: 25, min: 0 },

    // Default work-order template
    estimated_cost:     { type: Number, default: 0, min: 0 },
    estimated_downtime_hours: { type: Number, default: 0, min: 0 },
    parts:              { type: [PartTemplateSchema], default: [] },
    checklist:          { type: [String], default: [] }, // free-form steps

    priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },

    is_active: { type: Boolean, default: true, index: true },

    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

PmPlanSchema.index({ assetId: 1, is_active: 1 });
PmPlanSchema.index({ is_active: 1, nextDueAt: 1 });

PmPlanSchema.plugin(auditPlugin, { entity_type: "PmPlan", entity_no_field: "pm_plan_id" });

const PmPlanModel = mongoose.model("PmPlan", PmPlanSchema);
export default PmPlanModel;
