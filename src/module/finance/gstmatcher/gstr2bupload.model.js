import mongoose from "mongoose";

// ── GSTR-2A / 2B Upload ──────────────────────────────────────────────────────
//
// Stores the per-period inward-supplies file pulled from the GST portal.
// One upload = one (return_period × source) snapshot. Re-uploading the same
// period is allowed — older snapshots remain for audit, only the latest is
// active by default.
//
// return_period format: "MM-YYYY"  e.g. "04-2026" for April 2026
// source: "GSTR-2A" (auto-populated, dynamic) or "GSTR-2B" (static, frozen on 14th)
//
// Each "entry" is one line item from the 2A/2B file — typically one B2B
// invoice or credit/debit note from a supplier.

const Gstr2bEntrySchema = new mongoose.Schema(
  {
    // Vendor identity (from GSTR file)
    supplier_gstin: { type: String, required: true, index: true },
    supplier_name:  { type: String, default: "" },

    // Invoice / document
    doc_type:       { type: String, enum: ["INV", "CRN", "DBN"], default: "INV" }, // Invoice / Credit Note / Debit Note
    invoice_no:     { type: String, required: true },
    invoice_date:   { type: Date,   required: true },
    place_of_supply:{ type: String, default: "" },   // state code
    reverse_charge: { type: Boolean, default: false },

    // Values
    invoice_value:  { type: Number, default: 0 },    // total incl. tax
    taxable_value:  { type: Number, default: 0 },
    cgst_amt:       { type: Number, default: 0 },
    sgst_amt:       { type: Number, default: 0 },
    igst_amt:       { type: Number, default: 0 },
    cess_amt:       { type: Number, default: 0 },
    rate_pct:       { type: Number, default: 0 },    // combined CGST+SGST or IGST

    // ITC eligibility flags
    itc_eligible:   { type: Boolean, default: true },
    itc_reason:     { type: String, default: "" },   // reason if ineligible

    // Filing trail
    filing_period:  { type: String, default: "" },   // MM-YYYY when supplier filed GSTR-1
    filing_date:    { type: Date,   default: null },

    // Match state — populated by the matcher
    match_status: {
      type: String,
      enum: ["unmatched", "matched", "mismatched", "missing_in_books"],
      default: "unmatched",
      index: true,
    },
    matched_bill_ref: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseBill", default: null },
    matched_bill_no:  { type: String, default: "" },
    mismatch_reasons: [{ type: String }],            // ["amount_differs", "date_differs", ...]
  },
  { _id: false }
);

const Gstr2bUploadSchema = new mongoose.Schema(
  {
    return_period:  { type: String, required: true, index: true },   // "04-2026"
    source:         { type: String, enum: ["GSTR-2A", "GSTR-2B"], default: "GSTR-2B" },

    company_gstin:  { type: String, default: "" },                   // recipient GSTIN

    // Original raw file metadata (for audit)
    original_filename: { type: String, default: "" },
    file_format:       { type: String, enum: ["json", "csv", "manual"], default: "json" },

    entries: { type: [Gstr2bEntrySchema], default: [] },

    // Roll-up totals (populated on save)
    summary: {
      entry_count:        { type: Number, default: 0 },
      total_invoice_value:{ type: Number, default: 0 },
      total_taxable:      { type: Number, default: 0 },
      total_cgst:         { type: Number, default: 0 },
      total_sgst:         { type: Number, default: 0 },
      total_igst:         { type: Number, default: 0 },
      total_cess:         { type: Number, default: 0 },
      eligible_itc:       { type: Number, default: 0 },
    },

    // Match-run state
    last_matched_at:   { type: Date, default: null },
    match_summary: {
      matched_count:          { type: Number, default: 0 },
      mismatched_count:       { type: Number, default: 0 },
      missing_in_books_count: { type: Number, default: 0 },
      missing_in_2b_count:    { type: Number, default: 0 },
    },

    // Lifecycle
    is_active:   { type: Boolean, default: true },   // Latest upload for the period
    notes:       { type: String, default: "" },

    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true }
);

Gstr2bUploadSchema.pre("save", function (next) {
  const r2 = (n) => Math.round((n ?? 0) * 100) / 100;
  this.summary.entry_count        = this.entries.length;
  this.summary.total_invoice_value= r2(this.entries.reduce((s, e) => s + (e.invoice_value || 0), 0));
  this.summary.total_taxable      = r2(this.entries.reduce((s, e) => s + (e.taxable_value || 0), 0));
  this.summary.total_cgst         = r2(this.entries.reduce((s, e) => s + (e.cgst_amt      || 0), 0));
  this.summary.total_sgst         = r2(this.entries.reduce((s, e) => s + (e.sgst_amt      || 0), 0));
  this.summary.total_igst         = r2(this.entries.reduce((s, e) => s + (e.igst_amt      || 0), 0));
  this.summary.total_cess         = r2(this.entries.reduce((s, e) => s + (e.cess_amt      || 0), 0));
  this.summary.eligible_itc       = r2(this.entries
    .filter(e => e.itc_eligible)
    .reduce((s, e) => s + (e.cgst_amt || 0) + (e.sgst_amt || 0) + (e.igst_amt || 0), 0));
  next();
});

Gstr2bUploadSchema.index({ return_period: 1, source: 1, is_active: 1 });
Gstr2bUploadSchema.index({ "entries.supplier_gstin": 1, "entries.invoice_no": 1 });

const Gstr2bUploadModel = mongoose.model("Gstr2bUpload", Gstr2bUploadSchema);
export default Gstr2bUploadModel;
