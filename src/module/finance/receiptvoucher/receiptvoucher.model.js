import mongoose from "mongoose";

// ── Enums ─────────────────────────────────────────────────────────────────────
const SUPPLIER_TYPES = ["Vendor", "Contractor"];
const RECEIPT_MODES  = ["Cash", "Cheque", "NEFT", "RTGS", "UPI", "DD"];

// ── Embedded sub-schemas ──────────────────────────────────────────────────────

// One double-entry line — mirrors the Dr/Cr table in the voucher screen
const EntryLineSchema = new mongoose.Schema(
  {
    dr_cr:        { type: String, enum: ["Dr", "Cr"], required: true },
    account_name: { type: String, default: "" }, // e.g. "HDFC Bank A/c", "Vendor A/c"
    debit_amt:    { type: Number, default: 0 },
    credit_amt:   { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const ReceiptVoucherSchema = new mongoose.Schema(
  {
    // Auto-generated: RV/<FY>/<seq>  e.g. RV/25-26/0001
    rv_no: { type: String, unique: true },

    rv_date:       { type: Date,   default: null },
    document_year: { type: String, default: "" },  // e.g. "25-26"

    // ── Receipt instrument ────────────────────────────────────────────────
    receipt_mode: { type: String, enum: RECEIPT_MODES, default: "NEFT" },
    bank_name:    { type: String, default: "" },  // receiving bank account
    bank_ref:     { type: String, default: "" },  // UTR / NEFT / RTGS ref no.
    cheque_no:    { type: String, default: "" },
    cheque_date:  { type: Date,   default: null },

    // ── Source supplier (Vendor or Contractor who pays you back) ──────────
    // Use case: vendor advance refund, security deposit return, etc.
    supplier_type:  { type: String, enum: SUPPLIER_TYPES, required: true },
    supplier_id:    { type: String, default: "" },  // vendor_id or contractor_id
    supplier_ref:   { type: mongoose.Schema.Types.ObjectId, default: null },
    supplier_name:  { type: String, default: "" },  // snapshot
    supplier_gstin: { type: String, default: "" },  // snapshot

    // ── Tender (optional — for project-wise tracking) ─────────────────────
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },

    // ── Against document (optional — advance receipt, refund against a bill) ──
    against_ref: { type: mongoose.Schema.Types.ObjectId, default: null },
    against_no:  { type: String, default: "" },  // snapshot

    // ── Receipt amount ────────────────────────────────────────────────────
    amount: { type: Number, default: 0 },

    // ── Double-entry lines ────────────────────────────────────────────────
    entries: {
      type: [EntryLineSchema],
      validate: {
        validator: (val) => Array.isArray(val) && val.length > 0,
        message: "A receipt voucher must have at least one entry line",
      },
      default: [],
    },

    narration: { type: String, default: "" },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "pending", "approved"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
ReceiptVoucherSchema.index({ supplier_id: 1, rv_date: -1 });       // supplier receipt history
ReceiptVoucherSchema.index({ tender_id: 1, rv_date: -1 });         // tender-wise receipts
ReceiptVoucherSchema.index({ status: 1, rv_date: -1 });            // approval queue
ReceiptVoucherSchema.index({ supplier_type: 1, supplier_id: 1 });  // filter by type

const ReceiptVoucherModel = mongoose.model("ReceiptVoucher", ReceiptVoucherSchema);
export default ReceiptVoucherModel;
