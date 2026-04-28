import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// AssetCalibration — calibration certificate ledger.
// Each document is one calibration event: who calibrated, when, against which
// agency, what was measured, the result, and the certificate file. Linked back
// to the TaggedAsset so the asset record can show "last calibration date" and
// "next due date" without a join.
//
// On save, the service updates TaggedAsset.compliance.last_calibration_date /
// .next_calibration_due / .last_certificate_url for fast filter on due alerts.

const MeasurementSubSchema = new Schema(
  {
    parameter: { type: String, required: true },     // "Angular accuracy", "Distance ±5m"
    expected: String,
    actual: String,
    deviation: String,
    within_tolerance: { type: Boolean, default: true },
  },
  { _id: false }
);

const AssetCalibrationSchema = new mongoose.Schema(
  {
    calibration_id: { type: String, required: true, unique: true, index: true }, // "CAL001"

    // Asset link (only Tagged assets are calibrated — Survey/Lab/Detection items)
    asset_ref: { type: Schema.Types.ObjectId, ref: "TaggedAsset", required: true, index: true },
    asset_id_label: { type: String, required: true, index: true },
    asset_name: { type: String, trim: true },
    asset_class: { type: String, trim: true },

    // Dates
    calibration_date: { type: Date, required: true, index: true },
    next_due_date: { type: Date, required: true, index: true },

    // Calibration agency
    agency_name: { type: String, required: true, trim: true },
    agency_accreditation: { type: String, trim: true }, // "NABL", "ISO 17025", etc.
    agency_contact: { type: String, trim: true },

    // Certificate
    certificate_number: { type: String, required: true, trim: true, index: true },
    certificate_url: String,

    // Outcome
    result: {
      type: String,
      enum: ["PASS", "FAIL", "ADJUSTED", "OUT_OF_TOLERANCE"],
      required: true,
      index: true,
    },
    measurements: { type: [MeasurementSubSchema], default: [] },

    // Cost
    cost: { type: Number, min: 0 },
    invoice_number: { type: String, trim: true },

    performed_by: { type: String, trim: true }, // operator/technician name from agency
    notes: String,

    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

AssetCalibrationSchema.index({ asset_ref: 1, calibration_date: -1 });

AssetCalibrationSchema.plugin(auditPlugin, {
  entity_type: "AssetCalibration",
  entity_no_field: "calibration_id",
});

const AssetCalibrationModel = mongoose.model("AssetCalibration", AssetCalibrationSchema);
export default AssetCalibrationModel;
