import mongoose from "mongoose";

// ── Journal Entry (JE) ────────────────────────────────────────────────────────
//
// A Journal Entry is the general-purpose double-entry record for any financial
// transaction that does not have a dedicated voucher (Purchase Bill, Payment, etc.).
//
// RULES:
//   1. Every JE must balance: Σ debit_amt = Σ credit_amt (enforced on save)
//   2. Every entry line must reference a valid posting account in AccountTree
//   3. Entries are NEVER edited after approval — only reversing JEs correct errors
//   4. When a JE line affects a supplier account (2010-VND-xxx, 2020-CTR-xxx),
//      a corresponding LedgerEntry is also auto-posted for supplier ledger accuracy
//
// Common use cases:
//   Opening Balance    → enter historical balances when going live
//   Depreciation       → Dr Depreciation Exp / Cr Accumulated Depreciation
//   Bank Reconciliation→ Dr Bank Charges / Cr Bank Account (from statement)
//   Payroll            → Dr Salary Expense / Cr Bank + PF Payable + TDS Payable
//   Accrual            → record cost incurred but not yet invoiced (month-end)
//   Provision          → Dr Bad Debt Exp / Cr Provision for Bad Debts
//   Reversal           → mirror-image of a prior JE to correct an error
//   ITC Reversal       → Dr ITC Reversal Liability / Cr CGST/SGST Input (ITC lost)

// ── Enums ─────────────────────────────────────────────────────────────────────

const JE_TYPES = [
  "Opening Balance",       // Entering historical account balances on system go-live
  "Depreciation",          // Periodic depreciation on fixed assets
  "Bank Reconciliation",   // Bank charges, interest credit from bank statement
  "Payroll",               // Monthly salary disbursement journal
  "Accrual",               // Expense/income accrued but not yet invoiced
  "Provision",             // Provision for bad debts, warranties, penalties
  "ITC Reversal",          // GST input tax credit reversal
  "Inter-Account Transfer",// Moving funds between bank accounts or cost centres
  "Reversal",              // Correction: reverses a prior approved JE entry-for-entry
  "Adjustment",            // General period-end or audit adjustment
  "Other",                 // Miscellaneous
  // ── Auto-generated from voucher approvals ─────────────────────────────────
  "Purchase Invoice",      // Auto-created on PurchaseBill approval
  "Contractor Bill",       // Auto-created on WeeklyBilling approval
  "Payment",               // Auto-created on PaymentVoucher approval
  "Receipt",               // Auto-created on ReceiptVoucher approval
  "Credit Note",           // Auto-created on CreditNote approval
  "Debit Note",            // Auto-created on DebitNote approval
  "Client Bill",           // Auto-created on ClientBilling approval
  "Client Credit Note",    // Auto-created on ClientCN approval
  "Expense Voucher",       // Auto-created on ExpenseVoucher approval
];

// ── Entry line schema ─────────────────────────────────────────────────────────
// Each line = one side of a double-entry. At least 2 lines required (1 Dr + 1 Cr).
// Split entries are allowed (e.g. 1 Dr line and 3 Cr lines — as long as totals match).

const JELineSchema = new mongoose.Schema(
  {
    // ── Account reference (from AccountTree) ──────────────────────────
    account_code: { type: String, required: true },  // e.g. "5410", "2010-VND-001"
    account_name: { type: String, default: "" },     // snapshot — frozen on posting
    account_type: { type: String, default: "" },     // snapshot: Asset/Liability/Expense/Income/Equity

    // ── Double-entry side ─────────────────────────────────────────────
    dr_cr:      { type: String, enum: ["Dr", "Cr"], required: true },
    debit_amt:  { type: Number, default: 0 },
    credit_amt: { type: Number, default: 0 },

    // ── Per-line narration (optional — useful for split entries) ──────
    narration: { type: String, default: "" },

    // ── Supplier cross-post fields ────────────────────────────────────
    // Populated when this line's account_code is a personal supplier ledger
    // (e.g. "2010-VND-001"). The service uses these to also post to LedgerEntry.
    supplier_id:   { type: String, default: null },   // "VND-001", "CTR-012"
    supplier_type: { type: String, default: null },   // "Vendor" | "Contractor"
    supplier_ref:  { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const JournalEntrySchema = new mongoose.Schema(
  {
    // Auto-generated: JE/<FY>/<seq>  e.g. JE/25-26/0001
    je_no: { type: String, unique: true },

    je_date:       { type: Date,   default: null },
    document_year: { type: String, default: "" },    // e.g. "25-26"
    financial_year:{ type: String, default: "" },    // same format — indexed

    // ── Classification ────────────────────────────────────────────────
    je_type: {
      type: String,
      enum: JE_TYPES,
      default: "Adjustment",
    },

    // ── Mandatory narration (audit requirement) ───────────────────────
    // Explains WHY this journal entry was made. Required for approval.
    narration: { type: String, default: "" },

    // ── Entry lines (minimum 2: at least one Dr and one Cr) ───────────
    lines: {
      type:     [JELineSchema],
      validate: {
        validator: (val) => Array.isArray(val) && val.length >= 2,
        message:  "A journal entry must have at least 2 lines (1 Dr + 1 Cr)",
      },
      default: [],
    },

    // ── Computed totals (set by pre-save) ─────────────────────────────
    total_debit:  { type: Number, default: 0 },
    total_credit: { type: Number, default: 0 },

    // ── Tender (optional — project-specific adjustments) ─────────────
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },

    // ── Reversal fields ───────────────────────────────────────────────
    // is_reversal: true means this JE was auto-generated to reverse another one.
    is_reversal:   { type: Boolean, default: false },
    reversal_of:   { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    // je_no of the original JE being reversed (snapshot for display)
    reversal_of_no: { type: String, default: "" },

    // auto_reverse_date: if set, a reversing JE is created automatically on this date.
    // Used for accrual entries that need to be unwound at month-start.
    auto_reverse_date: { type: Date, default: null },
    auto_reversed:     { type: Boolean, default: false }, // true once the auto-reversal JE is created

    // ── Source voucher (for auto-generated JEs) ───────────────────────
    // When a JE is auto-created by a voucher approval (PurchaseBill, Payment, etc.)
    // these fields link back to the originating document for audit traceability.
    //   source_type: "PurchaseBill" | "WeeklyBilling" | "PaymentVoucher" |
    //                "ReceiptVoucher" | "CreditNote" | "DebitNote"
    source_ref:  { type: mongoose.Schema.Types.ObjectId, default: null },
    source_type: { type: String, default: "" },   // model name of originating document
    source_no:   { type: String, default: "" },   // doc_id / bill_no / pv_no / rv_no / cn_no / dn_no

    // ── Posted flag ───────────────────────────────────────────────────
    // true once this JE has been approved and all LedgerEntry cross-posts are done.
    is_posted: { type: Boolean, default: false },

    // ── Lifecycle ─────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "pending", "approved"],
      default: "pending",
    },

    // ── Audit trail ───────────────────────────────────────────────────
    approved_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    approved_at:  { type: Date, default: null },
    created_by:   { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true }
);

// ── Pre-save: compute totals ──────────────────────────────────────────────────
JournalEntrySchema.pre("save", function (next) {
  this.total_debit  = Math.round(this.lines.reduce((s, l) => s + (l.debit_amt  || 0), 0) * 100) / 100;
  this.total_credit = Math.round(this.lines.reduce((s, l) => s + (l.credit_amt || 0), 0) * 100) / 100;
  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────
JournalEntrySchema.index({ je_date: -1, createdAt: -1 });              // chronological list
JournalEntrySchema.index({ financial_year: 1, je_type: 1 });           // FY + type reports
JournalEntrySchema.index({ status: 1, je_date: -1 });                  // approval queue
JournalEntrySchema.index({ tender_id: 1, je_date: -1 });               // tender-wise JEs
JournalEntrySchema.index({ is_reversal: 1 });                          // find all reversals
JournalEntrySchema.index({ reversal_of: 1 });                          // find reversal of a JE
JournalEntrySchema.index({ "lines.account_code": 1 });                 // find JEs by account
JournalEntrySchema.index({ auto_reverse_date: 1, auto_reversed: 1 });  // pending auto-reversals
JournalEntrySchema.index({ source_ref: 1, source_type: 1 });           // find JE for a voucher

const JournalEntryModel = mongoose.model("JournalEntry", JournalEntrySchema);
export default JournalEntryModel;
