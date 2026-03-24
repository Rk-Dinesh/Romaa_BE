import mongoose from "mongoose";

// ── Enums ─────────────────────────────────────────────────────────────────────
const SUPPLIER_TYPES  = ["Vendor", "Contractor"];
const PAYMENT_MODES   = ["Cash", "Cheque", "NEFT", "RTGS", "UPI", "DD"];

// ── Embedded sub-schemas ──────────────────────────────────────────────────────

// One double-entry line — mirrors the Dr/Cr table in the voucher screen
const EntryLineSchema = new mongoose.Schema(
  {
    dr_cr:        { type: String, enum: ["Dr", "Cr"], required: true },
    account_name: { type: String, default: "" }, // e.g. "Vendor A/c", "HDFC Bank A/c"
    debit_amt:    { type: Number, default: 0 },
    credit_amt:   { type: Number, default: 0 },
  },
  { _id: false }
);

// Which bills are being settled by this payment (optional — On Account allowed)
const BillRefSchema = new mongoose.Schema(
  {
    bill_ref:    { type: mongoose.Schema.Types.ObjectId, default: null },
    bill_no:     { type: String, default: "" },  // snapshot
    settled_amt: { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const PaymentVoucherSchema = new mongoose.Schema(
  {
    // Auto-generated: PV/<FY>/<seq>  e.g. PV/25-26/0001
    pv_no: { type: String, unique: true },

    pv_date:       { type: Date,   default: null },
    document_year: { type: String, default: "" },  // e.g. "25-26"

    // ── Payment instrument ────────────────────────────────────────────────
    payment_mode: { type: String, enum: PAYMENT_MODES, default: "NEFT" },
    bank_name:    { type: String, default: "" },  // paying bank account
    bank_ref:     { type: String, default: "" },  // UTR / NEFT / RTGS ref no.
    cheque_no:    { type: String, default: "" },
    cheque_date:  { type: Date,   default: null },

    // ── Supplier being paid (Vendor or Contractor) ────────────────────────
    supplier_type:  { type: String, enum: SUPPLIER_TYPES, required: true },
    supplier_id:    { type: String, default: "" },  // vendor_id or contractor_id
    supplier_ref:   { type: mongoose.Schema.Types.ObjectId, default: null },
    supplier_name:  { type: String, default: "" },  // snapshot
    supplier_gstin: { type: String, default: "" },  // snapshot

    // ── Tender (optional — for project-wise tracking) ─────────────────────
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },

    // ── Bills being settled (optional — On Account if empty) ─────────────
    bill_refs: { type: [BillRefSchema], default: [] },

    // ── Payment amount ────────────────────────────────────────────────────
    amount: { type: Number, default: 0 },

    // ── Double-entry lines ────────────────────────────────────────────────
    entries: {
      type: [EntryLineSchema],
      validate: {
        validator: (val) => Array.isArray(val) && val.length > 0,
        message: "A payment voucher must have at least one entry line",
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
PaymentVoucherSchema.index({ supplier_id: 1, pv_date: -1 });      // supplier payment history
PaymentVoucherSchema.index({ tender_id: 1, pv_date: -1 });        // tender-wise payments
PaymentVoucherSchema.index({ status: 1, pv_date: -1 });           // approval queue
PaymentVoucherSchema.index({ supplier_type: 1, supplier_id: 1 }); // filter by type

const PaymentVoucherModel = mongoose.model("PaymentVoucher", PaymentVoucherSchema);
export default PaymentVoucherModel;
