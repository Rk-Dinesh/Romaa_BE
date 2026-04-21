import mongoose from "mongoose";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Line item per bill ────────────────────────────────────────────────────────
const ItemSchema = new mongoose.Schema(
  {
    item_code:        { type: String, default: "" },
    item_name:        { type: String, default: "" },
    unit:             { type: String, default: "" },
    rate:             { type: Number, default: 0 },
    mb_book_ref:      { type: String, default: "" },

    agreement_qty:    { type: Number, default: 0 },
    agreement_amount: { type: Number, default: 0 },

    upto_date_qty:    { type: Number, default: 0 },
    upto_date_amount: { type: Number, default: 0 },

    prev_bill_qty:    { type: Number, default: 0 },
    prev_bill_amount: { type: Number, default: 0 },

    current_qty:      { type: Number, default: 0 },
    current_amount:   { type: Number, default: 0 },

    excess_qty:         { type: Number, default: 0 },
    excess_amount:      { type: Number, default: 0 },
    excess_percentage:  { type: Number, default: 0 },

    balance_qty:        { type: Number, default: 0 },
    balance_amount:     { type: Number, default: 0 },
    balance_percentage: { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────
const BillingSchema = new mongoose.Schema(
  {
    // Auto-generated: B/<FY>/<seq>  e.g. B/25-26/0001
    bill_id: { type: String, unique: true },

    tender_id:      { type: String, required: true, index: true },
    tender_name:    { type: String, default: "" },
    bill_date:    { type: Date, default: Date.now },

    // ── Client snapshot (filled at create from Tender + Clients master) ──────
    client_id:    { type: String, default: "" },
    client_name:  { type: String, default: "" },
    client_gstin: { type: String, default: "" },   // snapshot — used in GSTR-1 B2B
    client_state: { type: String, default: "" },   // snapshot — used to derive place_of_supply

    // ── Place of Supply (GST) ─────────────────────────────────────────────────
    // "InState"  — supplier's state = recipient's state  → CGST + SGST
    // "Others"   — different state                        → IGST
    // Derived from tax_mode if not set. Captured explicitly so GSTR-1 B2B / B2CL
    // classification is accurate.
    place_of_supply: { type: String, enum: ["InState", "Others"], default: "InState" },

    previous_bill_id: { type: mongoose.Schema.Types.ObjectId, ref: "billing", default: null },

    items: [ItemSchema],

    // ── Computed totals (pre-save) ────────────────────────────────────────────
    total_upto_date_amount: { type: Number, default: 0 },
    total_prev_bill_amount: { type: Number, default: 0 },
    grand_total:            { type: Number, default: 0 }, // base (before GST + retention)

    // ── GST ───────────────────────────────────────────────────────────────────
    tax_mode:  { type: String, enum: ["instate", "otherstate"], default: "instate" },
    cgst_pct:  { type: Number, default: 0 },
    sgst_pct:  { type: Number, default: 0 },
    igst_pct:  { type: Number, default: 0 },
    cgst_amt:  { type: Number, default: 0 }, // pre-save computed
    sgst_amt:  { type: Number, default: 0 }, // pre-save computed
    igst_amt:  { type: Number, default: 0 }, // pre-save computed
    total_tax: { type: Number, default: 0 }, // pre-save computed

    // ── Retention ─────────────────────────────────────────────────────────────
    retention_pct:    { type: Number, default: 0 },
    retention_amount: { type: Number, default: 0 }, // pre-save computed
    // Cumulative retention received back from client (via RetentionRelease).
    // retention_outstanding = retention_amount − retention_released
    retention_released: { type: Number, default: 0 },

    // ── Other deductions (TDS, mobilization advance recovery, labour cess, etc.)
    deductions: [
      {
        description: { type: String, default: "" },
        amount:      { type: Number, default: 0 },
        _id: false,
      },
    ],
    total_deductions: { type: Number, default: 0 }, // pre-save computed

    // ── Final payable (pre-save) ──────────────────────────────────────────────
    net_amount: { type: Number, default: 0 }, // grand_total + total_tax - retention - deductions

    // ── Payment tracking ──────────────────────────────────────────────────────
    amount_received: { type: Number, default: 0 },
    balance_due:     { type: Number, default: 0 }, // pre-save: net_amount - received
    paid_status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    payment_refs: [
      {
        rv_ref:    { type: mongoose.Schema.Types.ObjectId, ref: "ReceiptVoucher", default: null },
        rv_no:     { type: String, default: "" },
        recv_amt:  { type: Number, default: 0 },
        recv_date: { type: Date, default: null },
      },
    ],

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Checked", "Approved", "Paid", "Rejected"],
      default: "Draft",
    },

    narration:         { type: String, default: "" },
    created_by_user:   { type: String, default: "" },

    // ── Journal Entry link (set on approval) ─────────────────────────────────
    je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:  { type: String, default: "" },   // snapshot: JE/25-26/0001
  },
  { timestamps: true }
);

// ── Pre-save: compute all derived fields ──────────────────────────────────────
BillingSchema.pre("save", function (next) {
  let grandTotal = 0;
  let totalUpto  = 0;
  let totalPrev  = 0;

  for (const item of this.items) {
    const rate        = Number(item.rate)          || 0;
    const agreementQty = Number(item.agreement_qty) || 0;
    const currentQty  = Number(item.current_qty)   || 0;
    const prevQty     = Number(item.prev_bill_qty)  || 0;

    item.agreement_amount = round2(agreementQty * rate);
    item.current_amount  = round2(currentQty * rate);
    item.prev_bill_amount = round2(prevQty * rate);
    item.upto_date_qty   = currentQty + prevQty;
    item.upto_date_amount = round2(item.upto_date_qty * rate);

    if (item.upto_date_qty > agreementQty) {
      item.excess_qty   = round2(item.upto_date_qty - agreementQty);
      item.balance_qty  = 0;
    } else {
      item.excess_qty   = 0;
      item.balance_qty  = round2(agreementQty - item.upto_date_qty);
    }
    item.excess_amount  = round2(item.excess_qty  * rate);
    item.balance_amount = round2(item.balance_qty * rate);

    if (agreementQty > 0) {
      item.excess_percentage  = round2((item.excess_qty  / agreementQty) * 100);
      item.balance_percentage = round2((item.balance_qty / agreementQty) * 100);
    } else {
      item.excess_percentage  = 0;
      item.balance_percentage = 0;
    }

    totalUpto  += item.upto_date_amount;
    totalPrev  += item.prev_bill_amount;
    grandTotal += item.current_amount;
  }

  this.total_upto_date_amount = round2(totalUpto);
  this.total_prev_bill_amount = round2(totalPrev);
  this.grand_total            = round2(grandTotal);

  // GST — enforce tax_mode (instate: CGST+SGST, otherstate: IGST only)
  if (this.tax_mode === "otherstate") {
    this.cgst_pct = 0;
    this.sgst_pct = 0;
  } else {
    this.igst_pct = 0;
  }

  // Derive place_of_supply from tax_mode if not set explicitly
  if (!this.place_of_supply) {
    this.place_of_supply = this.tax_mode === "otherstate" ? "Others" : "InState";
  }
  this.cgst_amt  = round2(this.grand_total * this.cgst_pct / 100);
  this.sgst_amt  = round2(this.grand_total * this.sgst_pct / 100);
  this.igst_amt  = round2(this.grand_total * this.igst_pct / 100);
  this.total_tax = round2(this.cgst_amt + this.sgst_amt + this.igst_amt);

  // Retention
  this.retention_amount = round2(this.grand_total * (this.retention_pct || 0) / 100);

  // Other deductions
  this.total_deductions = round2(
    (this.deductions || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
  );

  // Net payable to Romaa by client
  this.net_amount = round2(this.grand_total + this.total_tax - this.retention_amount - this.total_deductions);

  // Outstanding balance
  this.balance_due = round2(this.net_amount - (this.amount_received || 0));

  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────
BillingSchema.index({ client_id: 1, bill_date: -1 });
BillingSchema.index({ status: 1, bill_date: -1 });

const BillingModel = mongoose.model("clientbilling", BillingSchema);
export default BillingModel;
