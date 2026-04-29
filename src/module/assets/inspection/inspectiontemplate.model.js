import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// InspectionTemplate — re-usable checklist tied to an asset CLASS (not a single
// asset). One template can have many items; each item is either critical
// (fail blocks operation) or non-critical (logged but allowed).
//
// Template scope is by asset_class + frequency. Examples:
//   • class="Machinery", frequency="DAILY", title="Excavator Pre-Shift Walk-around"
//   • class="Vehicle",   frequency="WEEKLY", title="Tipper Weekly Inspection"

const InspectionItemSchema = new Schema(
  {
    item_no:    { type: Number, required: true },
    section:    { type: String, trim: true }, // "Engine", "Hydraulics", "Brakes"
    question:   { type: String, required: true, trim: true },
    response_type: {
      type: String,
      enum: ["YES_NO", "PASS_FAIL", "NUMERIC", "TEXT"],
      default: "PASS_FAIL",
    },
    is_critical: { type: Boolean, default: false }, // failure blocks operation
    expected:    String, // optional expected value description
  },
  { _id: false }
);

const InspectionTemplateSchema = new mongoose.Schema(
  {
    template_id: { type: String, required: true, unique: true, index: true }, // "ITP001"
    title:       { type: String, required: true, trim: true },

    asset_class_ref:  { type: Schema.Types.ObjectId, ref: "AssetCategoryMaster" },
    asset_class:      { type: String, index: true }, // "Machinery", "Vehicle"
    asset_category:   { type: String }, // "Earthmoving"
    asset_sub_category: { type: String }, // "Excavator"

    frequency: {
      type: String,
      enum: ["PRE_SHIFT", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"],
      required: true,
      index: true,
    },

    items: { type: [InspectionItemSchema], default: [] },

    is_active: { type: Boolean, default: true, index: true },

    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

InspectionTemplateSchema.index({ asset_class: 1, frequency: 1, is_active: 1 });

InspectionTemplateSchema.plugin(auditPlugin, {
  entity_type: "InspectionTemplate",
  entity_no_field: "template_id",
});

const InspectionTemplateModel = mongoose.model("InspectionTemplate", InspectionTemplateSchema);
export default InspectionTemplateModel;
