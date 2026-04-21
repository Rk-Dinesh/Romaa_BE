import mongoose from "mongoose";

// ── Expense Voucher (EV) ──────────────────────────────────────────────────────
//
// A direct expense voucher records one-off payments that are NOT raised against
// a vendor/contractor bill. Typical use cases:
//
//   - Petty cash payments at site (fuel, tea, local purchases)
//   - Conveyance / travel reimbursements
//   - Office supplies / stationery bought off-the-shelf
//   - Utility bills paid directly (electricity, internet) without vendor master
//   - Employee reimbursements
//   - Courier, printing, misc site overheads
//
// Difference vs Payment Voucher:
//   PaymentVoucher → settles a supplier's payable (must have Vendor/Contractor/Client)
//   ExpenseVoucher → books an expense directly against an expense account; no supplier required
//
// Double-entry on approval (auto-posted via JournalEntry):
//   Dr  Expense A/c (each line — 5310 Material / 5410 Site Overhead / 5710 Admin / etc.)
//   Dr  CGST Input / SGST Input / IGST Input  (if GST charged)
//   Cr  TDS Payable (if TDS deducted)
//   Cr  Bank / Cash A/c  (the paid_from account)

// ── Enums ─────────────────────────────────────────────────────────────────────
const PAYMENT_MODES = ["Cash", "Cheque", "NEFT", "RTGS", "UPI", "DD", "Card"];
const PAYEE_TYPES   = ["External", "Employee", "Other"];

// ── Embedded: one expense line ────────────────────────────────────────────────
// Each line posts to a single Expense leaf account. Multiple lines allow splitting
// one voucher across expense heads (e.g. one cab bill split 60% site / 40% admin).

const ExpenseLineSchema = new mongoose.Schema(
  {
    // AccountTree leaf, must be account_type === "Expense" (or "Asset" for prepaid)
    expense_account_code: { type: String, required: true, trim: true },
    expense_account_name: { type: String, default: "" },   // snapshot

    // Short per-line description (e.g. "Petrol — site car", "Auto fare to site")
    description: { type: String, default: "" },

    // Pre-tax taxable amount for this line
    amount: { type: Number, required: true, min: 0 },

    // GST (optional — usually 0 for petty cash, but kept for bill-backed expenses)
    gst_pct:  { type: Number, default: 0 },
    cgst_amt: { type: Number, default: 0 },
    sgst_amt: { type: Number, default: 0 },
    igst_amt: { type: Number, default: 0 },

    // Per-line total = amount + cgst + sgst + igst (computed by pre-save)
    line_total: { type: Number, default: 0 },

    // Optional project / tender tagging for project-wise cost tracking
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const ExpenseVoucherSchema = new mongoose.Schema(
  {
    // Auto-generated: EV/<FY>/<seq>  e.g. EV/25-26/0001
    ev_no: { type: String, unique: true },

    ev_date:       { type: Date,   default: null },
    document_year: { type: String, default: "" },  // "25-26"

    // ── Payee (free-text; no master record required) ─────────────────────
    payee_name: { type: String, default: "" },   // "HP Petrol Pump", "Ravi Kumar"
    payee_type: { type: String, enum: PAYEE_TYPES, default: "External" },

    // If payee_type = "Employee", link the employee for reimbursement tracking
    employee_id:  { type: String, default: "" },   // emp_id e.g. EMP-001
    employee_ref: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },

    // ── Paying bank / cash account (must be is_bank_cash leaf in AccountTree) ─
    paid_from_account_code: { type: String, default: "" },
    paid_from_account_name: { type: String, default: "" },  // snapshot

    // ── Payment instrument ────────────────────────────────────────────────
    payment_mode: { type: String, enum: PAYMENT_MODES, default: "Cash" },
    reference_no: { type: String, default: "" },  // UTR / NEFT / UPI ref
    cheque_no:    { type: String, default: "" },
    cheque_date:  { type: Date,   default: null },

    // ── Expense lines (at least 1) ────────────────────────────────────────
    lines: {
      type: [ExpenseLineSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "An expense voucher must have at least one expense line",
      },
      default: [],
    },

    // ── Optional tender tag at voucher level (used when all lines share same project) ─
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" },

    // ── Bill / receipt photo (S3 key) ─────────────────────────────────────
    bill_photo_url: { type: String, default: "" },
    bill_no:        { type: String, default: "" },   // external reference if any

    // ── TDS (optional) ────────────────────────────────────────────────────
    tds_section: { type: String, default: "" },   // 194C, 194J, etc.
    tds_pct:     { type: Number, default: 0 },
    tds_amt:     { type: Number, default: 0 },    // computed by pre-save

    // ── Totals (computed by pre-save) ─────────────────────────────────────
    subtotal:   { type: Number, default: 0 },  // Σ line.amount (pre-tax)
    total_tax:  { type: Number, default: 0 },  // Σ (cgst + sgst + igst)
    gross_total:{ type: Number, default: 0 },  // subtotal + total_tax (before TDS)
    net_paid:   { type: Number, default: 0 },  // gross_total − tds_amt (actually paid)

    narration: { type: String, default: "" },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "pending", "approved"],
      default: "pending",
    },

    // ── Journal Entry link (set on approval) ──────────────────────────────
    je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:  { type: String, default: "" },

    // ── Audit ─────────────────────────────────────────────────────────────
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    approved_at: { type: Date, default: null },
    is_deleted:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── Pre-save: compute line_total, subtotal, total_tax, gross_total, tds, net ──
ExpenseVoucherSchema.pre("save", function (next) {
  const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

  let subtotal = 0;
  let totalTax = 0;

  for (const line of this.lines) {
    const amt  = Number(line.amount)   || 0;
    const cgst = Number(line.cgst_amt) || 0;
    const sgst = Number(line.sgst_amt) || 0;
    const igst = Number(line.igst_amt) || 0;
    line.line_total = r2(amt + cgst + sgst + igst);
    subtotal += amt;
    totalTax += cgst + sgst + igst;
  }

  this.subtotal    = r2(subtotal);
  this.total_tax   = r2(totalTax);
  this.gross_total = r2(subtotal + totalTax);

  if (this.tds_pct > 0) {
    this.tds_amt = r2(this.gross_total * this.tds_pct / 100);
  } else {
    this.tds_amt = r2(this.tds_amt || 0);
  }

  this.net_paid = r2(this.gross_total - this.tds_amt);

  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────
ExpenseVoucherSchema.index({ ev_date: -1, createdAt: -1 });
ExpenseVoucherSchema.index({ status: 1, ev_date: -1 });
ExpenseVoucherSchema.index({ tender_id: 1, ev_date: -1 });
ExpenseVoucherSchema.index({ payee_type: 1, employee_id: 1 });
ExpenseVoucherSchema.index({ paid_from_account_code: 1, ev_date: -1 });
ExpenseVoucherSchema.index({ "lines.expense_account_code": 1 });
ExpenseVoucherSchema.index({ "lines.tender_id": 1 });

const ExpenseVoucherModel = mongoose.model("ExpenseVoucher", ExpenseVoucherSchema);
export default ExpenseVoucherModel;
