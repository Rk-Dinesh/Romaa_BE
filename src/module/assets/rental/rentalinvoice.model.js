import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// RentalInvoice — monthly billing rollup against a RentalAgreement. Pulls
// usage from MachineDailyLog (for hour-/km-based billing) and applies the
// agreement's pricing rules. A "DRAFT" invoice is editable; once "FINALIZED"
// the totals are frozen and a journal entry can be raised by finance.

const RentalInvoiceSchema = new mongoose.Schema(
  {
    invoice_id: { type: String, required: true, unique: true, index: true }, // "RIV001"
    agreement_ref: { type: Schema.Types.ObjectId, ref: "RentalAgreement", required: true, index: true },
    agreement_no:  { type: String, index: true },

    direction: { type: String, enum: ["INCOMING", "OUTGOING"], required: true, index: true },
    asset_id_label: String,
    asset_name: String,
    counterparty_id: String,
    counterparty_name: String,
    projectId: String,

    period_start: { type: Date, required: true },
    period_end:   { type: Date, required: true },
    period_label: { type: String, required: true, index: true }, // "2026-04"

    // Usage in period
    days_used:  { type: Number, default: 0 },
    hours_used: { type: Number, default: 0 },
    kms_used:   { type: Number, default: 0 },

    base_amount:      { type: Number, default: 0, min: 0 },
    overtime_amount:  { type: Number, default: 0, min: 0 },
    other_charges:    { type: Number, default: 0, min: 0 },
    deductions:       { type: Number, default: 0, min: 0 },
    taxable_amount:   { type: Number, default: 0, min: 0 },
    gst_amount:       { type: Number, default: 0, min: 0 },
    total_amount:     { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ["DRAFT", "FINALIZED", "INVOICED", "PAID", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },
    invoice_number: String, // external invoice number once raised
    invoice_date:   Date,
    paid_date:      Date,
    paid_amount:    { type: Number, default: 0, min: 0 },

    notes: String,
    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

RentalInvoiceSchema.index({ agreement_ref: 1, period_label: 1 }, { unique: true });
RentalInvoiceSchema.index({ direction: 1, status: 1 });

RentalInvoiceSchema.plugin(auditPlugin, {
  entity_type: "RentalInvoice",
  entity_no_field: "invoice_id",
});

const RentalInvoiceModel = mongoose.model("RentalInvoice", RentalInvoiceSchema);
export default RentalInvoiceModel;
