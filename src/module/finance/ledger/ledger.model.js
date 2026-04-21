import mongoose from "mongoose";

// ── LedgerEntry ───────────────────────────────────────────────────────────────
// Each document = one posted transaction line in the supplier ledger.
// This is a write-once append-only register — entries are never edited,
// only new correction entries are appended (matching real accounting practice).
//
// Running balance is NOT stored here — it is computed at query time via
// cumulative $sum aggregation so historical corrections never cause drift.
//
// Voucher types and what creates them:
//   PurchaseBill → Cr entry  (liability created — you owe supplier)
//   CreditNote   → Dr entry  (liability reduced — material return / overbilling)
//   DebitNote    → Dr entry  (liability reduced — penalty / price diff)
//   Payment      → Dr entry  (liability cleared — payment made to supplier)
//   Journal      → Dr or Cr  (manual adjustment / opening balance)

// ── Enums ─────────────────────────────────────────────────────────────────────
const SUPPLIER_TYPES = ["Vendor", "Contractor", "Client"];

const VCH_TYPES = [
  "PurchaseBill",   // PB — raises payable
  "WeeklyBill",     // WB — raises payable
  "CreditNote",     // CN — reduces payable
  "DebitNote",      // DN — reduces payable
  "Payment",        // PY — clears payable
  "Receipt",        // RE — reduces payable
  "ClientBill",     // CB — raises receivable (client owes us)
  "ClientCN",       // CCN — reduces receivable (credit note to client)
  "Journal",        // JOUR — manual / opening balance
];

// ── Main schema ───────────────────────────────────────────────────────────────

const LedgerEntrySchema = new mongoose.Schema(
  {
    // ── Supplier ──────────────────────────────────────────────────────────
    supplier_type:  { type: String, enum: SUPPLIER_TYPES, required: true },
    supplier_id:    { type: String, required: true },   // vendor_id or contractor_id
    supplier_ref:   { type: mongoose.Schema.Types.ObjectId, default: null },
    supplier_name:  { type: String, default: "" },      // snapshot for display

    // ── Voucher identity ──────────────────────────────────────────────────
    vch_date: { type: Date, required: true },
    vch_no:   { type: String, default: "" },   // CN/25-26/0001, PB/25-26/0001, etc.
    vch_type: { type: String, enum: VCH_TYPES, required: true },

    // Polymorphic reference — points to the source document
    // (PurchaseBill, CreditNote, DebitNote, or a future Payment model)
    vch_ref:  { type: mongoose.Schema.Types.ObjectId, default: null },

    // ── Payment reference (for Payment vouchers) ──────────────────────────
    cheque_no:   { type: String, default: "" },  // cheque / UTR / NEFT ref
    cheque_date: { type: Date,   default: null },

    // ── Particulars ───────────────────────────────────────────────────────
    particulars: { type: String, default: "" }, // human-readable description

    // ── Tender (optional — for tender-wise ledger view) ───────────────────
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },

    // ── Financial year (e.g. "25-26") ────────────────────────────────────
    // Auto-set by postEntry from vch_date. Enables fast FY-scoped reports.
    financial_year: { type: String, default: "" },

    // ── Amounts ───────────────────────────────────────────────────────────
    // Always populate only the relevant side; leave the other as 0.
    //   PurchaseBill → credit_amt > 0  (liability created)
    //   CN / DN / Payment → debit_amt > 0  (liability reduced)
    debit_amt:  { type: Number, default: 0 },
    credit_amt: { type: Number, default: 0 },
    // balance is NOT stored — computed at query time via running $sum

    // ── Audit fields ──────────────────────────────────────────────────────
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Primary access pattern: all entries for a supplier sorted by date
LedgerEntrySchema.index({ supplier_id: 1, vch_date: 1, createdAt: 1 });

// Tender-wise ledger (e.g. show all payables for TND-001)
LedgerEntrySchema.index({ tender_id: 1, supplier_id: 1, vch_date: 1 });

// Duplicate protection — prevent double-posting when vch_ref is set.
// sparse: true means null vch_ref entries (Journal) are excluded from uniqueness check.
LedgerEntrySchema.index({ vch_ref: 1, vch_type: 1 }, { sparse: true });

// Filter by voucher type (e.g. all payments, all CNs)
LedgerEntrySchema.index({ supplier_id: 1, vch_type: 1, vch_date: -1 });

// FY-scoped reports
LedgerEntrySchema.index({ supplier_id: 1, financial_year: 1 });

const LedgerEntryModel = mongoose.model("LedgerEntry", LedgerEntrySchema);
export default LedgerEntryModel;
