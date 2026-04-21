import mongoose from "mongoose";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Budget ────────────────────────────────────────────────────────────────────
//
// One Budget document = budgeted amounts for ONE tender across ONE financial
// year, broken down by chart-of-accounts head (Income or Expense leaves).
// Variance = budget − actual, where "actual" is computed at report time from
// approved JournalEntry lines tagged to this tender + account.
//
// Period granularity is held per-line (annual / quarterly / monthly) so a
// single budget can mix lump-sum overheads with month-by-month line items.

const PERIOD_GRANULARITIES = ["annual", "quarterly", "monthly"];

const BudgetLineSchema = new mongoose.Schema(
  {
    // Chart-of-accounts leaf (must be Income or Expense; service validates)
    account_code:  { type: String, required: true },
    account_name:  { type: String, default: "" },
    account_type:  { type: String, default: "" },   // "Income" | "Expense"

    period:        { type: String, enum: PERIOD_GRANULARITIES, default: "annual" },

    // For annual: ignored (or "FY-25-26").
    // For quarterly: "Q1" | "Q2" | "Q3" | "Q4" (FY-aligned: Q1=Apr-Jun).
    // For monthly: "YYYY-MM" e.g. "2025-04".
    period_label:  { type: String, default: "" },

    budget_amount: { type: Number, required: true, min: 0 },
    notes:         { type: String, default: "" },
  },
  { _id: true }
);

const BudgetSchema = new mongoose.Schema(
  {
    // Auto-generated: BUD/<tender_id>/<fy>
    budget_no: { type: String, unique: true },

    tender_id:   { type: String, required: true, index: true },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },

    financial_year: { type: String, required: true },   // "25-26"

    lines: {
      type: [BudgetLineSchema],
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: "At least one budget line is required" },
      default: [],
    },

    // Computed: Σ budget_amount across all lines (informational, not a constraint)
    total_budget: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["draft", "approved", "archived"],
      default: "draft",
    },

    narration:   { type: String, default: "" },
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    approved_by: { type: String, default: "" },
    approved_at: { type: Date,   default: null },
    is_deleted:  { type: Boolean, default: false },

    // ── Multi-currency ────────────────────────────────────────────────────
    currency:      { type: String, default: "INR", uppercase: true, trim: true },
    exchange_rate: { type: Number, default: 1 },  // rate to INR at transaction date

    // ── Optimistic locking ────────────────────────────────────────────────
    _version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

BudgetSchema.pre("save", function (next) {
  // Optimistic locking: increment _version on every update (not on initial create)
  if (!this.isNew) this._version += 1;

  this.total_budget = round2(
    (this.lines || []).reduce((s, l) => s + (Number(l.budget_amount) || 0), 0)
  );
  next();
});

BudgetSchema.index({ tender_id: 1, financial_year: 1 }, { unique: true });
BudgetSchema.index({ status: 1, financial_year: -1 });

const BudgetModel = mongoose.model("Budget", BudgetSchema);
export default BudgetModel;
