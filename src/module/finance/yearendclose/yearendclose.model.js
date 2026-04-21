import mongoose from "mongoose";

// ── Year-End Closing Record ──────────────────────────────────────────────────
//
// One record per financial year once the books are closed. The close does
// four things:
//   1. Computes P&L for the FY (income − expense).
//   2. Posts a closing JE that zeroes every Income and Expense account and
//      moves the net profit into a Reserves/Retained-Earnings account.
//   3. Snapshots the closing Balance Sheet (carries into next FY as opening).
//   4. Flips `status = "closed"` on this record, gating further backdated
//      postings in that FY (JournalEntryService checks this before approve).
//
// Reopening is allowed for corrections — it creates a reversing JE for the
// closing JE and flips `status` back to "reopened". Any post-close corrections
// require re-running the close.

const PnlSnapshotSchema = new mongoose.Schema(
  {
    total_income:  { type: Number, default: 0 },
    total_expense: { type: Number, default: 0 },
    net_profit:    { type: Number, default: 0 },            // +ve = profit, -ve = loss
    income_lines:  { type: [{ account_code: String, account_name: String, amount: Number }], default: [] },
    expense_lines: { type: [{ account_code: String, account_name: String, amount: Number }], default: [] },
  },
  { _id: false },
);

const BsLineSchema = new mongoose.Schema(
  {
    account_code: String,
    account_name: String,
    account_type: String,     // Asset | Liability | Equity
    balance:      Number,     // signed Dr-positive
  },
  { _id: false },
);

const YearEndCloseSchema = new mongoose.Schema(
  {
    financial_year: { type: String, required: true, unique: true },   // "25-26"
    fy_start_date:  { type: Date, required: true },
    fy_end_date:    { type: Date, required: true },

    status: {
      type: String,
      enum: ["draft", "closed", "reopened"],
      default: "draft",
    },

    retained_earnings_code: { type: String, default: "" },  // e.g. "3200"
    pnl_snapshot:           { type: PnlSnapshotSchema, default: () => ({}) },
    balance_sheet_snapshot: { type: [BsLineSchema], default: [] },

    // Closing JE linkage
    closing_je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    closing_je_no:  { type: String, default: "" },

    // Reversal linkage (when reopened)
    reversal_je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    reversal_je_no:  { type: String, default: "" },
    reopen_reason:   { type: String, default: "" },

    closed_on:   { type: Date, default: null },
    closed_by:   { type: String, default: "" },
    reopened_on: { type: Date, default: null },
    reopened_by: { type: String, default: "" },
  },
  { timestamps: true },
);

YearEndCloseSchema.index({ status: 1, financial_year: 1 });

const YearEndCloseModel = mongoose.model("YearEndClose", YearEndCloseSchema);
export default YearEndCloseModel;
