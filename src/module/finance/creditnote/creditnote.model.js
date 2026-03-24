import mongoose from "mongoose";

// ── Supplier type ─────────────────────────────────────────────────────────────
// Supplier can be a Vendor (material) or a Contractor (labour/work)
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
    account_name: { type: String, default: "" }, // ledger account head (e.g. "CGST Input", "Material Cost")
    debit_amt:    { type: Number, default: 0 },
    credit_amt:   { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const CreditNoteSchema = new mongoose.Schema(
  {
    // Auto-generated: CN/<FY>/<seq>  e.g. CN/25-26/0001
    cn_no: { type: String, unique: true },

    cn_date:        { type: Date,    default: null },
    document_year:  { type: String,  default: "" },   // e.g. "25-26"
    reference_no:   { type: String,  default: "" },   // vendor's / contractor's own CN reference
    reference_date: { type: Date,    default: null },

    location:   { type: String, default: "" },
    sales_type: { type: String, enum: SALES_TYPES, default: "Local" },
    adj_type:   { type: String, enum: ADJ_TYPES,   default: "Against Bill" },
    tax_type:   { type: String, enum: TAX_TYPES,   default: "GST" },
    rev_charge: { type: Boolean, default: false },  // Reverse Charge Mechanism Y/N

    // ── Supplier (Vendor or Contractor — locked at creation) ───────────────
    supplier_type:  { type: String, enum: SUPPLIER_TYPES, required: true },
    supplier_id:    { type: String, default: "" },    // vendor_id or contractor_id
    supplier_ref:   { type: mongoose.Schema.Types.ObjectId, default: null },
    // refPath is intentionally omitted — String IDs are used as business keys;
    // populate manually in service if needed based on supplier_type
    supplier_name:  { type: String, default: "" },    // snapshot: company_name or contractor_name
    supplier_gstin: { type: String, default: "" },    // snapshot: gstin or gst_number

    // ── Tender (optional — for project-wise tracking) ─────────────────────
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },

    // ── Linked bill (optional — for Against Bill adjustment) ──────────────
    bill_ref: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseBill", default: null },
    bill_no:  { type: String, default: "" },  // snapshot of PurchaseBill.doc_id

    // ── Voucher amount (header-level) ─────────────────────────────────────
    amount: { type: Number, default: 0 },   // total credit note value

    // ── Double-entry lines ────────────────────────────────────────────────
    entries: {
      type: [EntryLineSchema],
      validate: {
        validator: (val) => Array.isArray(val) && val.length > 0,
        message: "A credit note must have at least one entry line",
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
CreditNoteSchema.index({ supplier_id: 1, cn_date: -1 });     // supplier CN history
CreditNoteSchema.index({ tender_id: 1, cn_date: -1 });       // tender-wise CNs
CreditNoteSchema.index({ bill_ref: 1 });                     // CNs against a bill
CreditNoteSchema.index({ status: 1, cn_date: -1 });          // approval queue
CreditNoteSchema.index({ supplier_type: 1, supplier_id: 1 }); // filter by type

const CreditNoteModel = mongoose.model("CreditNote", CreditNoteSchema);
export default CreditNoteModel;
