import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// RentalAgreement — formal agreement covering rental of an asset, either:
//   • direction = "INCOMING"  →  WE rent FROM a vendor (RENTAL ASSET, payable)
//   • direction = "OUTGOING"  →  WE rent OUR asset OUT to a client (receivable)
// Tied to a MachineryAsset for fleet, or a TaggedAsset / BulkInventory for
// non-machinery rentals (kept polymorphic).
//
// Each agreement spawns monthly invoice rollups (RentalInvoice) for billing.

const RentalAgreementSchema = new mongoose.Schema(
  {
    agreement_id: { type: String, required: true, unique: true, index: true }, // "RNT001"

    direction:    { type: String, enum: ["INCOMING", "OUTGOING"], required: true, index: true },

    asset_kind: { type: String, enum: ["MACHINERY", "TAGGED", "BULK"], required: true },
    asset_ref:  { type: Schema.Types.ObjectId, required: true, index: true },
    asset_id_label: { type: String, required: true, index: true },
    asset_name:     String,

    // Counterparty
    counterparty_kind: { type: String, enum: ["VENDOR", "CLIENT"], required: true },
    counterparty_id:   { type: String, required: true, index: true },
    counterparty_name: { type: String, required: true },

    projectId: { type: String, index: true }, // site rented to / from

    start_date: { type: Date, required: true, index: true },
    end_date:   { type: Date, required: true, index: true },

    // Pricing
    pricing_basis: {
      type: String,
      enum: ["PER_DAY", "PER_HOUR", "PER_KM", "PER_MONTH"],
      required: true,
    },
    rate:           { type: Number, required: true, min: 0 },
    currency:       { type: String, default: "INR" },
    minimum_per_month: { type: Number, default: 0, min: 0 }, // floor
    free_hours_per_month: { type: Number, default: 0, min: 0 },
    overtime_rate:  { type: Number, default: 0, min: 0 },

    // Operating cost responsibility
    fuel_borne_by:    { type: String, enum: ["LESSEE", "LESSOR"], default: "LESSEE" },
    operator_borne_by:{ type: String, enum: ["LESSEE", "LESSOR"], default: "LESSEE" },
    maintenance_borne_by: { type: String, enum: ["LESSEE", "LESSOR"], default: "LESSOR" },

    // Deposits & terms
    security_deposit: { type: Number, default: 0, min: 0 },
    advance_paid:     { type: Number, default: 0, min: 0 },
    payment_terms_days: { type: Number, default: 30 },
    gst_pct:           { type: Number, default: 18 },

    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "ON_HOLD", "EXPIRED", "TERMINATED"],
      default: "DRAFT",
      index: true,
    },

    agreement_url: String, // signed PDF
    notes: String,

    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

RentalAgreementSchema.index({ direction: 1, status: 1 });
RentalAgreementSchema.index({ asset_id_label: 1, status: 1 });

RentalAgreementSchema.plugin(auditPlugin, {
  entity_type: "RentalAgreement",
  entity_no_field: "agreement_id",
});

const RentalAgreementModel = mongoose.model("RentalAgreement", RentalAgreementSchema);
export default RentalAgreementModel;
