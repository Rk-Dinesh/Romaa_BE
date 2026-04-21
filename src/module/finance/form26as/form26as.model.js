import mongoose from "mongoose";

// ── Form 26AS Entry ──────────────────────────────────────────────────────────
//
// Form 26AS is the income-tax department's consolidated TDS statement showing
// every rupee of tax deducted against the assessee's PAN by any deductor
// (clients, banks, etc.). We ingest it quarterly (uploaded from TRACES portal
// or pasted) and reconcile it against the TDS deductions we booked in
// ClientBilling.deductions[] — any mismatch means either the client under-
// reported to the IT dept, or we haven't booked a TDS deduction that they
// filed against our PAN.

const Form26ASEntrySchema = new mongoose.Schema(
  {
    // Identity
    financial_year: { type: String, required: true },  // "25-26"
    quarter:        { type: String, enum: ["Q1", "Q2", "Q3", "Q4"], required: true },

    // Deductor info (the client who withheld our TDS)
    deductor_tan:  { type: String, required: true, trim: true },     // 10-char TAN
    deductor_name: { type: String, default: "" },
    our_pan:       { type: String, default: "" },

    // Payment details from 26AS
    section:            { type: String, default: "" },           // 194C, 194J, etc.
    booked_date:        { type: Date, required: true },
    amount_credited:    { type: Number, required: true },        // gross amount credited to us
    tds_amount:         { type: Number, required: true },        // TDS deducted
    challan_number:     { type: String, default: "" },

    // Status as per 26AS (F = Final, P = Provisional, O = Overbooked, U = Unmatched)
    status_26as: { type: String, enum: ["F", "P", "O", "U", ""], default: "F" },

    // Linkage once reconciled to a ClientBilling
    matched_billing_ref: { type: mongoose.Schema.Types.ObjectId, ref: "Billing", default: null },
    matched_bill_no:     { type: String, default: "" },

    // Optional client_id for direct match when deductor_name is ambiguous
    client_id: { type: String, default: "" },

    uploaded_by: { type: String, default: "" },
  },
  { timestamps: true },
);

Form26ASEntrySchema.index({ financial_year: 1, quarter: 1 });
Form26ASEntrySchema.index({ deductor_tan: 1, financial_year: 1 });
Form26ASEntrySchema.index({ booked_date: 1 });

// Composite uniqueness: the upload service dedupes incoming rows with this
// same key, and the unique index below enforces it at the storage layer so
// an out-of-band import can't slip a duplicate in. `partialFilterExpression`
// lets us skip the check for rows missing a challan_number (older 26AS PDFs
// sometimes omit it) — those still dedupe in-service but aren't blocked here.
Form26ASEntrySchema.index(
  {
    financial_year:  1,
    quarter:         1,
    deductor_tan:    1,
    section:         1,
    booked_date:     1,
    amount_credited: 1,
    tds_amount:      1,
    challan_number:  1,
  },
  { unique: true, name: "uniq_26as_entry" },
);

const Form26ASEntryModel = mongoose.model("Form26ASEntry", Form26ASEntrySchema);
export default Form26ASEntryModel;
