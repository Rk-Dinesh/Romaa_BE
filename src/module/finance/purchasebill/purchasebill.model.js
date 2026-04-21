import mongoose from "mongoose";

// Round to 2 decimal places — eliminates IEEE 754 float drift without Decimal128.
// Decimal128 is theoretically precise but returns special objects from Mongoose,
// breaks JSON serialization to the frontend, and doesn't fix precision loss that
// already happened when the client sent floats over JSON. round2 is the pragmatic
// standard for INR at this scale.
const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Embedded sub-schemas ──────────────────────────────────────────────────────

// One row per line item — includes GRN reference and material detail
const LineItemSchema = new mongoose.Schema(
  {
    grn_no:           { type: String, default: "" },  // grn_bill_no from MaterialTransaction
    grn_ref:          { type: mongoose.Schema.Types.ObjectId, ref: "MaterialTransaction", default: null },
    ref_date:         { type: Date,   default: null },
    item_id:          { type: mongoose.Schema.Types.ObjectId, ref: "Material", default: null },
    item_description: { type: String, default: "" },
    unit:             { type: String, default: "" },
    accepted_qty:     { type: Number, default: 0 },  // same as grn_qty
    unit_price:       { type: Number, default: 0 }, // quoted_rate from GRN
    gross_amt:        { type: Number, default: 0 }, // accepted_qty × unit_price
    cgst_pct:         { type: Number, default: 0 },
    sgst_pct:         { type: Number, default: 0 },
    igst_pct:         { type: Number, default: 0 },
    cgst_amt:         { type: Number, default: 0 }, // derived by pre-save
    sgst_amt:         { type: Number, default: 0 }, // derived by pre-save
    igst_amt:         { type: Number, default: 0 }, // derived by pre-save
    net_amt:          { type: Number, default: 0 }, // derived by pre-save: gross + tax
  },
  { _id: false }
);

// One row per unique GST rate slab — rebuilt by pre-save from line_items
const TaxGroupSchema = new mongoose.Schema(
  {
    cgst_pct: { type: Number, default: 0 },
    sgst_pct: { type: Number, default: 0 },
    igst_pct: { type: Number, default: 0 },
    taxable:  { type: Number, default: 0 }, // sum of gross_amt in this slab
    cgst_amt: { type: Number, default: 0 },
    sgst_amt: { type: Number, default: 0 },
    igst_amt: { type: Number, default: 0 },
  },
  { _id: false }
);

// Additional charges / deductions — net is recalculated by pre-save
const ADDITIONAL_CHARGE_TYPES = [
  "Transport",
  "Supplier",
  "Loading / Unloading",
  "Insurance",
  "Freight",
  "Packing Charges",
  "Discount",
  "TCS Receivable",
  "Retention",
  "Security Deposit",
];

const AdditionalChargeSchema = new mongoose.Schema(
  {
    type:         { type: String, enum: ADDITIONAL_CHARGE_TYPES, required: true },
    amount:       { type: Number, default: 0 },
    gst_pct:      { type: Number, default: 0 },
    net:          { type: Number, default: 0 }, // derived by pre-save (negative for deductions)
    is_deduction: { type: Boolean, default: false }, // true → Discount, TCS Receivable
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const PurchaseBillSchema = new mongoose.Schema(
  {
    // Auto-generated system ID: PB/<FY>/<tender_id>/<seq>  e.g. PB/25-26/T001/0001
    doc_id: { type: String, unique: true, required: true },
    doc_date:    { type: Date,   default: null },
    invoice_no:   { type: String, default: "" }, // vendor's invoice number
    invoice_date: { type: Date,   default: null },
    credit_days:  { type: Number, default: 0 },
    due_date:     { type: Date,   default: null }, // always set by pre-save: doc_date + credit_days
    narration:    { type: String, default: "" },

    // ── Tender (locked after GRN pick) ────────────────────────────────────────
    tender_id:   { type: String, default: "" },
    tender_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name: { type: String, default: "" }, // snapshot — historical accuracy

    // ── Vendor (locked after GRN pick) ────────────────────────────────────────
    vendor_id:    { type: String, default: "" },
    vendor_ref:   { type: mongoose.Schema.Types.ObjectId, ref: "Vendors", default: null },
    vendor_name:  { type: String, default: "" }, // snapshot — historical accuracy
    vendor_gstin: { type: String, default: "" }, // snapshot — for printing

    // ── Tax configuration ─────────────────────────────────────────────────────
    place_of_supply: { type: String, enum: ["InState", "Others"],        default: "InState" },
    tax_mode:        { type: String, enum: ["instate", "otherstate"],    default: "instate" },

    // ── Bill detail arrays (bounded, sealed at creation) ──────────────────────
    // Validator: a bill must have at least one line item
    line_items: {
      type: [LineItemSchema],
      validate: {
        validator: (val) => Array.isArray(val) && val.length > 0,
        message: "A purchase bill must have at least one line item",
      },
      default: [],
    },

    // Rebuilt by pre-save — do not set manually
    tax_groups:         { type: [TaxGroupSchema],         default: [] },
    additional_charges: { type: [AdditionalChargeSchema], default: [] },

    // ── Computed totals — all set by pre-save ─────────────────────────────────
    grand_total: { type: Number, default: 0 }, // Σ line_items.gross_amt
    total_tax:   { type: Number, default: 0 }, // Σ all GST amounts
    round_off:   { type: Number, default: 0 }, // net_amount − pre_round  (±0.99)
    net_amount:  { type: Number, default: 0 }, // Math.round(grand_total + total_tax + charges)

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "pending", "approved"],
      default: "pending",
    },

    // ── Payment tracking ──────────────────────────────────────────────────────
    // Populated automatically when a PaymentVoucher referencing this bill is approved.
    paid_status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    amount_paid: { type: Number, default: 0 }, // cumulative amount received via PVs
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
        adj_no:       { type: String, default: "" },   // CN/DN number snapshot
        adj_amt:      { type: Number, default: 0 },
        adj_date:     { type: Date,   default: null },
      },
    ],
    // balance_due = net_amount - amount_paid - cn_amount - dn_amount
    balance_due: { type: Number, default: 0 },

    // ── Journal Entry link ────────────────────────────────────────────────────
    // Set on approval — points to the auto-created double-entry JournalEntry.
    je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:  { type: String, default: "" },   // snapshot: JE/25-26/0001

    // ── Audit fields ──────────────────────────────────────────────────────────
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── Pre-save middleware ───────────────────────────────────────────────────────
// Runs automatically on Model.create() and doc.save().
// Does NOT run on insertMany() or findOneAndUpdate() — use save() for those.
// Recalculates all derived fields from source data so the DB is always consistent
// regardless of what the client sent.

PurchaseBillSchema.pre("save", function (next) {
  // 1. Per-item tax amounts derived from pct × gross_amt
  //    Enforce tax_mode: instate → CGST+SGST only (zero IGST)
  //                      otherstate → IGST only (zero CGST+SGST)
  const isOtherState = this.tax_mode === "otherstate";
  for (const item of this.line_items) {
    if (isOtherState) {
      item.cgst_pct = 0;
      item.sgst_pct = 0;
    } else {
      item.igst_pct = 0;
    }
    item.cgst_amt = round2(item.gross_amt * item.cgst_pct / 100);
    item.sgst_amt = round2(item.gross_amt * item.sgst_pct / 100);
    item.igst_amt = round2(item.gross_amt * item.igst_pct / 100);
    item.net_amt  = round2(item.gross_amt + item.cgst_amt + item.sgst_amt + item.igst_amt);
  }

  // 2. Rebuild tax_groups by grouping items with the same rate slab
  const slabMap = {};
  for (const item of this.line_items) {
    const key = `${item.cgst_pct}_${item.sgst_pct}_${item.igst_pct}`;
    if (!slabMap[key]) {
      slabMap[key] = {
        cgst_pct: item.cgst_pct,
        sgst_pct: item.sgst_pct,
        igst_pct: item.igst_pct,
        taxable:  0,
        cgst_amt: 0,
        sgst_amt: 0,
        igst_amt: 0,
      };
    }
    slabMap[key].taxable  += item.gross_amt;
    slabMap[key].cgst_amt += item.cgst_amt;
    slabMap[key].sgst_amt += item.sgst_amt;
    slabMap[key].igst_amt += item.igst_amt;
  }
  this.tax_groups = Object.values(slabMap).map((g) => ({
    ...g,
    taxable:  round2(g.taxable),
    cgst_amt: round2(g.cgst_amt),
    sgst_amt: round2(g.sgst_amt),
    igst_amt: round2(g.igst_amt),
  }));

  // 3. grand_total = sum of gross amounts before tax
  this.grand_total = round2(
    this.line_items.reduce((sum, i) => sum + i.gross_amt, 0)
  );

  // 4. total_tax = sum of all GST from tax_groups
  this.total_tax = round2(
    this.tax_groups.reduce((sum, g) => sum + g.cgst_amt + g.sgst_amt + g.igst_amt, 0)
  );

  // 5. Recalculate net on each additional charge
  //    Deductions are stored as negative so they naturally subtract from the total
  let additionalTotal = 0;
  for (const charge of this.additional_charges) {
    const base = round2(charge.amount + round2(charge.amount * charge.gst_pct / 100));
    charge.net  = charge.is_deduction ? -Math.abs(base) : base;
    additionalTotal += charge.net;
  }
  additionalTotal = round2(additionalTotal);

  // 6. Pre-round total → round_off → net_amount
  const preRound     = round2(this.grand_total + this.total_tax + additionalTotal);
  this.net_amount    = Math.round(preRound);
  this.round_off     = round2(this.net_amount - preRound);

  // 7. due_date always derived from doc_date + credit_days (overrides client value)
  if (this.doc_date && this.credit_days > 0) {
    const d = new Date(this.doc_date);
    d.setDate(d.getDate() + this.credit_days);
    this.due_date = d;
  }

  // 8. balance_due = net_amount - payments - CN/DN adjustments
  this.balance_due = round2(
    this.net_amount - (this.amount_paid || 0) - (this.cn_amount || 0) - (this.dn_amount || 0)
  );

  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────
PurchaseBillSchema.index({ tender_id: 1, createdAt: -1 });   // tender bill list
PurchaseBillSchema.index({ vendor_id: 1, createdAt: -1 });   // vendor bill list
PurchaseBillSchema.index({ status: 1, doc_date: -1 });      // payment due / approval queue
PurchaseBillSchema.index({ paid_status: 1, doc_date: -1 }); // unpaid / partial bills queue
PurchaseBillSchema.index({ doc_date: -1 });                 // date-range reports
PurchaseBillSchema.index({ "line_items.item_id": 1 });       // multikey: item-wise reports
PurchaseBillSchema.index(
  { vendor_id: 1, invoice_no: 1 },
  { unique: true, partialFilterExpression: { invoice_no: { $ne: "" } } }
); // prevent duplicate vendor invoice numbers

const PurchaseBillModel = mongoose.model("PurchaseBill", PurchaseBillSchema);
export default PurchaseBillModel;
