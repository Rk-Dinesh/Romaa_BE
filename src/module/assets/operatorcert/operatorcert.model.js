import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// OperatorCertification — a license / certification that an employee holds,
// permitting them to operate a specific class of machinery. Used by the
// MachineryLog and AssetIssuance services to gate operator assignment so an
// uncertified operator cannot legally be put on a regulated machine.
//
// Examples:
//   • Forklift Operator (OSHA / DGFASLI)
//   • Crane Operator (Crane License Class 1 / 2)
//   • Heavy Vehicle Driver (HV License)
//   • Excavator Operator (skilled-trades cert)

const OperatorCertSchema = new mongoose.Schema(
  {
    cert_id: { type: String, required: true, unique: true, index: true }, // "OPC001"

    employee_id: { type: String, required: true, index: true }, // "EMP-001"
    employee_name: String,

    cert_type: {
      type: String,
      required: true,
      trim: true,
      // Free-form, but seeded list keeps UI dropdown consistent
      // e.g. "HV LICENSE", "CRANE OP CLASS-1", "FORKLIFT", "EXCAVATOR", "WELDER 3G", "ELECTRICIAN"
    },
    license_number: { type: String, required: true, trim: true },
    issuing_authority: String,

    // Asset class this license entitles the operator to run
    asset_class: {
      type: String,
      enum: ["Machinery", "Vehicle", "StationaryPlant", "Tool", "Other"],
      required: true,
      index: true,
    },
    asset_category:    { type: String }, // "Earthmoving", "Lifting"
    asset_sub_category:{ type: String }, // "Excavator", "Mobile Crane"

    issue_date:  { type: Date, required: true },
    expiry_date: { type: Date, required: true, index: true },

    document_url: String, // S3 link to scanned license

    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "REVOKED", "SUSPENDED"],
      default: "ACTIVE",
      index: true,
    },
    revoked_reason: String,

    notes: String,

    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

OperatorCertSchema.index({ employee_id: 1, asset_class: 1, status: 1 });
OperatorCertSchema.index({ expiry_date: 1, status: 1 });

OperatorCertSchema.plugin(auditPlugin, {
  entity_type: "OperatorCertification",
  entity_no_field: "cert_id",
});

const OperatorCertModel = mongoose.model("OperatorCertification", OperatorCertSchema);
export default OperatorCertModel;
