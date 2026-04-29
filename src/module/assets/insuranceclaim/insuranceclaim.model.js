import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// InsuranceClaim — incident & settlement tracking against an insured asset.
// Lifecycle: REPORTED → SURVEY → DOCUMENTS_SUBMITTED → APPROVED → SETTLED
//                                                   ↘ REJECTED
//                                                   ↘ WITHDRAWN
// Linked to MachineryAsset (heavy equipment / fleet); the same model can be
// reused later for TaggedAsset claims if needed.

const ClaimDocumentSchema = new Schema(
  {
    doc_type: { type: String, enum: ["FIR", "Survey Report", "Estimate", "Invoice", "Photos", "Discharge Voucher", "Other"] },
    doc_number: String,
    file_url: String,
    uploaded_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const InsuranceClaimSchema = new mongoose.Schema(
  {
    claim_id: { type: String, required: true, unique: true, index: true }, // "ICL001"

    asset_ref: { type: Schema.Types.ObjectId, ref: "MachineryAsset", required: true, index: true },
    assetId:   { type: String, required: true, index: true },
    asset_name: String,

    // Policy at the time of incident — frozen in case master changes later
    insurer_name:        String,
    insurance_policy_no: { type: String, required: true, trim: true },
    policy_start: Date,
    policy_end:   Date,

    incident_type: {
      type: String,
      enum: ["ACCIDENT", "FIRE", "THEFT", "VANDALISM", "FLOOD", "ENGINE_FAILURE", "THIRD_PARTY", "OTHER"],
      required: true,
      index: true,
    },
    incident_date: { type: Date, required: true, index: true },
    incident_location: String,
    description: String,

    fir_filed: { type: Boolean, default: false },
    fir_number: String,
    police_station: String,

    surveyor_name:    String,
    surveyor_contact: String,
    survey_date:      Date,

    claimed_amount:   { type: Number, default: 0, min: 0 },
    approved_amount:  { type: Number, default: 0, min: 0 },
    settled_amount:   { type: Number, default: 0, min: 0 },
    deductible:       { type: Number, default: 0, min: 0 },
    settlement_date:  Date,

    status: {
      type: String,
      enum: ["REPORTED", "SURVEY", "DOCUMENTS_SUBMITTED", "APPROVED", "SETTLED", "REJECTED", "WITHDRAWN"],
      default: "REPORTED",
      index: true,
    },
    rejection_reason: String,

    related_work_order_ref: { type: Schema.Types.ObjectId, ref: "WorkOrder", default: null },

    documents: { type: [ClaimDocumentSchema], default: [] },
    notes: String,

    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

InsuranceClaimSchema.index({ assetId: 1, status: 1 });
InsuranceClaimSchema.index({ status: 1, incident_date: -1 });

InsuranceClaimSchema.plugin(auditPlugin, {
  entity_type: "InsuranceClaim",
  entity_no_field: "claim_id",
});

const InsuranceClaimModel = mongoose.model("InsuranceClaim", InsuranceClaimSchema);
export default InsuranceClaimModel;
