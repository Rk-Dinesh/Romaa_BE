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
    account_code: { type: String, default: "" }, // AccountTree.account_code (e.g. "2010-VND-001", "5410")
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
    amount:    { type: Number, default: 0 }, // total credit note value (gross)
    round_off: { type: Number, default: 0 }, // rounding diff sent by FE (max ±₹1)

    // ── Tax breakup ───────────────────────────────────────────────────────
    // taxable_amount = base value before GST (pre-save sets amount = taxable_amount + total_tax)
    taxable_amount: { type: Number, default: 0 },
    cgst_pct:   { type: Number, default: 0 },
    sgst_pct:   { type: Number, default: 0 },
    igst_pct:   { type: Number, default: 0 },
    cgst_amt:   { type: Number, default: 0 }, // computed by pre-save
    sgst_amt:   { type: Number, default: 0 }, // computed by pre-save
    igst_amt:   { type: Number, default: 0 }, // computed by pre-save
    total_tax:  { type: Number, default: 0 }, // computed by pre-save

    // ── Double-entry lines ────────────────────────────────────────────────
    entries: { type: [EntryLineSchema], default: [] },

    narration: { type: String, default: "" },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "pending", "approved"],
      default: "pending",
    },

    // ── Journal Entry link ────────────────────────────────────────────────
    // Set on approval — points to the auto-created double-entry JournalEntry.
    je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:  { type: String, default: "" },   // snapshot: JE/25-26/0001
  },
  { timestamps: true }
);

// ── Pre-save: compute tax amounts from taxable_amount × rate ──────────────────
CreditNoteSchema.pre("save", function (next) {
  const r2 = (n) => Math.round((n ?? 0) * 100) / 100;
  if (this.taxable_amount > 0 && (this.cgst_pct > 0 || this.sgst_pct > 0 || this.igst_pct > 0)) {
    this.cgst_amt  = r2(this.taxable_amount * this.cgst_pct  / 100);
    this.sgst_amt  = r2(this.taxable_amount * this.sgst_pct  / 100);
    this.igst_amt  = r2(this.taxable_amount * this.igst_pct  / 100);
    this.total_tax = r2(this.cgst_amt + this.sgst_amt + this.igst_amt);
    this.amount    = r2(this.taxable_amount + this.total_tax);
  } else if (this.taxable_amount > 0) {
    this.amount = this.taxable_amount;
  }
  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────
CreditNoteSchema.index({ supplier_id: 1, cn_date: -1 });     // supplier CN history
CreditNoteSchema.index({ tender_id: 1, cn_date: -1 });       // tender-wise CNs
CreditNoteSchema.index({ bill_ref: 1 });                     // CNs against a bill
CreditNoteSchema.index({ status: 1, cn_date: -1 });          // approval queue
CreditNoteSchema.index({ supplier_type: 1, supplier_id: 1 }); // filter by type

const CreditNoteModel = mongoose.model("CreditNote", CreditNoteSchema);
export default CreditNoteModel;
