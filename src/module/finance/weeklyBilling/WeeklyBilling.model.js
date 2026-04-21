import mongoose from "mongoose";

// ── Sub Bill Summary ───────────────────────────────────────────────────────────
// One sub-bill is created per work order within a weekly bill.
// Line items live in WeeklyBillingTransaction (separate collection).
//
// sub_bill_no format:  WB/{tender_id}/{fin_year}/{seq:4}/S{sub_seq:2}
// Example:             WB/TND-001/25-26/0001/S01
const SubBillSchema = new mongoose.Schema(
  {
    sub_bill_no:    { type: String, required: true },  // WB/TND-001/25-26/0001/S01
    work_order_id:  { type: String, required: true },  // single WO per sub-bill
    work_done_ids:  [{ type: String }],                // all WD records for this WO in the period
    sub_base_amount: { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Weekly Bill ────────────────────────────────────────────────────────────────
// bill_no format:  WB/{tender_id}/{fin_year}/{seq:4}
// Example:         WB/TND-001/25-26/0001
//
// Sequence is per tender × financial-year (Apr–Mar), tracked atomically
// in BillCounterModel to prevent duplicate bill numbers under concurrent requests.
const WeeklyBillingSchema = new mongoose.Schema(
  {
    bill_no:  { type: String, unique: true },   // set by service before save
    bill_date: { type: Date, default: Date.now },

    tender_id:   { type: String, required: true, index: true },
    contractor_id:   { type: String, required: true },
    contractor_name: { type: String, required: true },
    fin_year:    { type: String }, // "25-26" — auto-set in pre-save hook

    from_date: { type: Date, required: true },
    to_date:   { type: Date, required: true },

    sub_bills: [SubBillSchema], // one entry per work order; items are in WeeklyBillingTransaction

    base_amount:  { type: Number, default: 0 }, // sum of sub_base_amounts
    gst_pct:      { type: Number, default: 0 }, // e.g. 18
    gst_amount:   { type: Number, default: 0 },
    total_amount: { type: Number, default: 0 },

    // ── GST split (instate = CGST+SGST, otherstate = IGST) ────────────────
    tax_mode:  { type: String, enum: ["instate", "otherstate"], default: "instate" },
    cgst_pct:  { type: Number, default: 0 },
    sgst_pct:  { type: Number, default: 0 },
    igst_pct:  { type: Number, default: 0 },
    cgst_amt:  { type: Number, default: 0 },
    sgst_amt:  { type: Number, default: 0 },
    igst_amt:  { type: Number, default: 0 },

    // ── Retention ─────────────────────────────────────────────────────────
    retention_pct: { type: Number, default: 0 }, // % withheld from contractor
    retention_amt: { type: Number, default: 0 }, // computed: total_amount × retention_pct/100
    net_payable:   { type: Number, default: 0 }, // computed: total_amount − retention_amt
    // Cumulative retention paid back to contractor (via RetentionRelease).
    // retention_outstanding = retention_amt − retention_released
    retention_released: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["Generated", "Pending", "Approved", "Cancelled"],
      default: "Generated",
    },

    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    approved_at: { type: Date, default: null },

    // ── Payment tracking ──────────────────────────────────────────────────────
    // Populated automatically when a PaymentVoucher referencing this bill is approved.
    paid_status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    amount_paid: { type: Number, default: 0 }, // cumulative amount paid via PVs
    payment_refs: [
      {
        pv_ref:    { type: mongoose.Schema.Types.ObjectId, ref: "PaymentVoucher", default: null },
        pv_no:     { type: String, default: "" },   // snapshot of PaymentVoucher.pv_no
        paid_amt:  { type: Number, default: 0 },
        paid_date: { type: Date,   default: null },
      },
    ],

    // ── CN/DN adjustment tracking ───────────────────────────────────────────
    // Populated automatically when a CreditNote/DebitNote "Against Bill" is approved.
    cn_amount: { type: Number, default: 0 },  // cumulative Credit Note adjustments
    dn_amount: { type: Number, default: 0 },  // cumulative Debit Note adjustments
    adjustment_refs: [
      {
        adj_type:     { type: String, enum: ["CreditNote", "DebitNote"] },
        adj_ref:      { type: mongoose.Schema.Types.ObjectId, default: null },
        adj_no:       { type: String, default: "" },
        adj_amt:      { type: Number, default: 0 },
        adj_date:     { type: Date,   default: null },
      },
    ],
    // balance_due = (net_payable || total_amount) - amount_paid - cn_amount - dn_amount
    balance_due: { type: Number, default: 0 },

    // ── Journal Entry link ────────────────────────────────────────────────────
    // Set on approval — points to the auto-created double-entry JournalEntry.
    je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:  { type: String, default: "" },   // snapshot: JE/25-26/0001

    // ── Soft delete ───────────────────────────────────────────────────────────
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── Auto fin_year: Apr–Mar Indian financial year ──────────────────────────────
// Mar 2026 → "25-26"   Apr 2026 → "26-27"
// Computed from bill_date (or current date) so the frontend never needs to send it.
WeeklyBillingSchema.pre("save", function (next) {
  const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

  // Auto fin_year from bill_date
  if (!this.fin_year) {
    const ref  = this.bill_date ? new Date(this.bill_date) : new Date();
    const yr   = ref.getFullYear();
    const mo   = ref.getMonth() + 1; // 1-12
    this.fin_year = mo >= 4
      ? `${String(yr).slice(2)}-${String(yr + 1).slice(2)}`   // "25-26"
      : `${String(yr - 1).slice(2)}-${String(yr).slice(2)}`;  // "24-25"
  }

  // balance_due = billTotal - payments - CN/DN adjustments
  const billTotal = this.net_payable || this.total_amount || 0;
  this.balance_due = r2(billTotal - (this.amount_paid || 0) - (this.cn_amount || 0) - (this.dn_amount || 0));

  next();
});

// Index for duplicate-bill check, list queries, and payment queue
WeeklyBillingSchema.index({ tender_id: 1, contractor_name: 1, from_date: 1, to_date: 1 });
WeeklyBillingSchema.index({ tender_id: 1, fin_year: 1 });
WeeklyBillingSchema.index({ paid_status: 1, bill_date: -1 }); // unpaid / partial bills queue

const WeeklyBillingModel = mongoose.model("WeeklyBilling", WeeklyBillingSchema);
export default WeeklyBillingModel;
