import mongoose from "mongoose";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Bank Reconciliation ───────────────────────────────────────────────────────
//
// One BankReconciliation document = one bank statement period (e.g. April 2025
// statement for HDFC-001). It holds the imported statement lines and tracks
// which book-side JournalEntry line each statement line is matched against.
//
// Matching philosophy — banker's perspective vs ours:
//   Statement DEBIT  (money OUT of company a/c) ↔  JE  Cr Bank line  in our books
//   Statement CREDIT (money IN  to company a/c) ↔  JE  Dr Bank line  in our books
//
// Workflow:
//   1. import   → status="draft", lines added with recon_status="unmatched"
//   2. autoMatch → service walks unmatched lines, finds matching JE bank line
//   3. manualMatch / unmatch → user fixes anything auto-match missed
//   4. close    → status="closed" (header locked, lines frozen)
//
// One-to-one constraint: a JE bank line can only be matched to ONE statement
// line across ALL reconciliations on that account. The service enforces this
// at match time via a lookup over already-matched (je_ref, je_line_index) pairs.

const RECON_STATUS = ["unmatched", "matched", "manual", "ignored"];

const BankStatementLineSchema = new mongoose.Schema(
  {
    // ── Imported from statement file ──────────────────────────────────────
    line_date:    { type: Date,   required: true },
    description:  { type: String, default: "" },
    ref_no:       { type: String, default: "" },   // UTR / cheque no / NEFT ref
    debit_amt:    { type: Number, default: 0 },     // money OUT of company a/c
    credit_amt:   { type: Number, default: 0 },     // money IN  to company a/c
    balance:      { type: Number, default: 0 },     // running balance from statement

    // ── Match state ───────────────────────────────────────────────────────
    recon_status: { type: String, enum: RECON_STATUS, default: "unmatched" },

    // Matched JE line — populated when recon_status ∈ {matched, manual}
    matched_je_ref:        { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    matched_je_no:         { type: String, default: "" },
    matched_je_line_index: { type: Number, default: -1 },   // index into JE.lines[]

    // Source voucher snapshot (for UI display + drill-down)
    matched_source_type: { type: String, default: "" },     // "PaymentVoucher" | "ReceiptVoucher" | "BankTransfer" | "ExpenseVoucher" | ""
    matched_source_no:   { type: String, default: "" },     // PV/25-26/0001 etc.

    matched_at: { type: Date,   default: null },
    matched_by: { type: String, default: "" },              // user id/name

    user_note: { type: String, default: "" },               // free-text note (esp. for "ignored")
  },
  { _id: true }
);

const BankReconciliationSchema = new mongoose.Schema(
  {
    // Auto-generated: BR/<FY>/<seq>  e.g. BR/25-26/0001
    statement_no: { type: String, unique: true },

    // ── Bank account being reconciled ────────────────────────────────────
    bank_account_code: { type: String, required: true, index: true },
    bank_account_name: { type: String, default: "" },     // snapshot

    // ── Statement period ─────────────────────────────────────────────────
    statement_date_from: { type: Date, required: true },
    statement_date_to:   { type: Date, required: true },

    // From statement header
    opening_balance: { type: Number, default: 0 },
    closing_balance: { type: Number, default: 0 },

    // ── Computed totals (pre-save) ───────────────────────────────────────
    total_debits:     { type: Number, default: 0 },     // Σ debit_amt
    total_credits:    { type: Number, default: 0 },     // Σ credit_amt
    matched_count:    { type: Number, default: 0 },     // lines with recon_status ∈ {matched, manual}
    unmatched_count:  { type: Number, default: 0 },
    ignored_count:    { type: Number, default: 0 },

    // ── Statement lines ──────────────────────────────────────────────────
    lines: { type: [BankStatementLineSchema], default: [] },

    // ── Lifecycle ────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "reconciled", "closed"],
      default: "draft",
    },

    narration:  { type: String, default: "" },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    closed_by:  { type: String, default: "" },
    closed_at:  { type: Date,   default: null },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BankReconciliationSchema.pre("save", function (next) {
  let totDr = 0, totCr = 0, mCount = 0, uCount = 0, iCount = 0;
  for (const l of this.lines) {
    totDr += Number(l.debit_amt)  || 0;
    totCr += Number(l.credit_amt) || 0;
    if (l.recon_status === "matched" || l.recon_status === "manual") mCount += 1;
    else if (l.recon_status === "ignored") iCount += 1;
    else uCount += 1;
  }
  this.total_debits    = round2(totDr);
  this.total_credits   = round2(totCr);
  this.matched_count   = mCount;
  this.unmatched_count = uCount;
  this.ignored_count   = iCount;

  // Auto-promote status when everything reconciled
  if (this.status === "draft" && uCount === 0 && this.lines.length > 0) {
    this.status = "reconciled";
  }
  next();
});

BankReconciliationSchema.index({ bank_account_code: 1, statement_date_to: -1 });
BankReconciliationSchema.index({ status: 1, statement_date_to: -1 });

const BankReconciliationModel = mongoose.model("BankReconciliation", BankReconciliationSchema);
export default BankReconciliationModel;
