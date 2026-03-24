import mongoose from "mongoose";

// ── Supplier type ─────────────────────────────────────────────────────────────
const SUPPLIER_TYPES = ["Vendor", "Contractor"];

// ── Enums ─────────────────────────────────────────────────────────────────────
const SALES_TYPES   = ["Local", "Interstate", "Export", "SEZ", "Exempt"];
const ADJ_TYPES     = ["Against Bill", "Advance Adjustment", "On Account"];
const TAX_TYPES     = ["GST", "NonGST", "Exempt"];

// ── Embedded sub-schemas ──────────────────────────────────────────────────────

// One double-entry line — mirrors the Dr/Cr table in the voucher screen
const EntryLineSchema = new mongoose.Schema(
  {
    dr_cr:        { type: String, enum: ["Dr", "Cr"], required: true },
    account_name: { type: String, default: "" }, // ledger account head
    debit_amt:    { type: Number, default: 0 },
    credit_amt:   { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const DebitNoteSchema = new mongoose.Schema(
  {
    // Auto-generated: DN/<FY>/<seq>  e.g. DN/25-26/0001
    // Screenshot format from Profit SRM: 25/25-26/DV/0008
    dn_no: { type: String, unique: true },

    dn_date:        { type: Date,   default: null },
    document_year:  { type: String, default: "" },   // e.g. "25-26"
    reference_no:   { type: String, default: "" },   // vendor's / contractor's own DN ref
    reference_date: { type: Date,   default: null },

    location:    { type: String, default: "" },
    sales_type:  { type: String, enum: SALES_TYPES, default: "Local" },
    adj_type:    { type: String, enum: ADJ_TYPES,   default: "Against Bill" },
    tax_type:    { type: String, enum: TAX_TYPES,   default: "GST" },
    rev_charge:  { type: Boolean, default: false },  // Reverse Charge Mechanism Y/N

    // ── Supplier (Vendor or Contractor — locked at creation) ───────────────
    supplier_type:  { type: String, enum: SUPPLIER_TYPES, required: true },
    supplier_id:    { type: String, default: "" },    // vendor_id or contractor_id
    supplier_ref:   { type: mongoose.Schema.Types.ObjectId, default: null },
    supplier_name:  { type: String, default: "" },    // snapshot
    supplier_gstin: { type: String, default: "" },    // snapshot

    // ── Tender (optional — for project-wise tracking) ─────────────────────
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },

    // ── Linked bill (optional — for Against Bill adjustment) ──────────────
    bill_ref: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseBill", default: null },
    bill_no:  { type: String, default: "" },   // snapshot of PurchaseBill.doc_id

    // ── Amounts (header-level) ────────────────────────────────────────────
    amount:      { type: Number, default: 0 }, // total debit note value
    service_amt: { type: Number, default: 0 }, // service amount (visible in DN screen)

    // ── Double-entry lines ────────────────────────────────────────────────
    entries: {
      type: [EntryLineSchema],
      validate: {
        validator: (val) => Array.isArray(val) && val.length > 0,
        message: "A debit note must have at least one entry line",
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
DebitNoteSchema.index({ supplier_id: 1, dn_date: -1 });       // supplier DN history
DebitNoteSchema.index({ tender_id: 1, dn_date: -1 });         // tender-wise DNs
DebitNoteSchema.index({ bill_ref: 1 });                       // DNs against a bill
DebitNoteSchema.index({ status: 1, dn_date: -1 });            // approval queue
DebitNoteSchema.index({ supplier_type: 1, supplier_id: 1 });  // filter by type

const DebitNoteModel = mongoose.model("DebitNote", DebitNoteSchema);
export default DebitNoteModel;
