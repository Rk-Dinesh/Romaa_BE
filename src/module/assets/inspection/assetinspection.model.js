import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// AssetInspection — a submitted instance of an InspectionTemplate against a
// specific machinery asset on a specific date. If any critical item fails,
// the service flips the asset's currentStatus to "Breakdown" and raises a
// remediation Work Order automatically.

const InspectionResponseSchema = new Schema(
  {
    item_no:    Number,
    question:   String,
    is_critical:{ type: Boolean, default: false },
    response_value: Schema.Types.Mixed,           // "YES" | "PASS" | numeric | text
    result:     { type: String, enum: ["PASS", "FAIL", "NA"], required: true },
    photo_url:  String,
    notes:      String,
  },
  { _id: false }
);

const AssetInspectionSchema = new mongoose.Schema(
  {
    inspection_id: { type: String, required: true, unique: true, index: true }, // "INS001"

    asset_ref:  { type: Schema.Types.ObjectId, ref: "MachineryAsset", required: true, index: true },
    assetId:    { type: String, required: true, index: true },
    asset_name: String,
    projectId:  { type: String, index: true },

    template_ref: { type: Schema.Types.ObjectId, ref: "InspectionTemplate", required: true },
    template_title: String,
    frequency: String,

    inspected_at: { type: Date, default: Date.now, index: true },
    inspected_by_employee_id:   String,
    inspected_by_employee_name: String,

    operatorId:   String, // who was assigned the machine that shift
    reading:      Number, // HMR / KMs at inspection

    responses: { type: [InspectionResponseSchema], default: [] },

    overall_result: {
      type: String,
      enum: ["PASS", "FAIL_NON_CRITICAL", "FAIL_CRITICAL"],
      required: true,
      index: true,
    },
    failed_critical_count:     { type: Number, default: 0 },
    failed_non_critical_count: { type: Number, default: 0 },

    remediation_work_order_ref: { type: Schema.Types.ObjectId, ref: "WorkOrder", default: null },

    supervisor_signoff_employee_id: String,
    supervisor_signoff_at: Date,
    supervisor_signature_url: String,

    notes: String,

    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

AssetInspectionSchema.index({ assetId: 1, inspected_at: -1 });
AssetInspectionSchema.index({ overall_result: 1, inspected_at: -1 });

AssetInspectionSchema.plugin(auditPlugin, {
  entity_type: "AssetInspection",
  entity_no_field: "inspection_id",
});

const AssetInspectionModel = mongoose.model("AssetInspection", AssetInspectionSchema);
export default AssetInspectionModel;
