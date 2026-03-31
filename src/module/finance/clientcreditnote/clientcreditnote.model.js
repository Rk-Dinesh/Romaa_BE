import mongoose from "mongoose";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Line item being credited ──────────────────────────────────────────────────
const ItemSchema = new mongoose.Schema(
  {
    item_code:     { type: String, default: "" },
    item_name:     { type: String, default: "" },
    unit:          { type: String, default: "" },
    rate:          { type: Number, default: 0 },
    return_qty:    { type: Number, default: 0 },
    return_amount: { type: Number, default: 0 }, // pre-save: return_qty × rate
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────
const ClientCNSchema = new mongoose.Schema(
  {
    // Auto-generated: CCN/<FY>/<seq>  e.g. CCN/25-26/0001
    ccn_no: { type: String, unique: true },

    ccn_date: { type: Date, default: Date.now },

    // ── Original bill reference ───────────────────────────────────────────────
    bill_ref: { type: mongoose.Schema.Types.ObjectId, ref: "billing", default: null },
    bill_id:  { type: String, default: "" }, // snapshot

    // ── Tender & client snapshots ─────────────────────────────────────────────
    tender_id:   { type: String, default: "", index: true },
    tender_name: { type: String, default: "" },
    client_id:   { type: String, default: "" },
    client_name: { type: String, default: "" },
    client_ref:  { type: mongoose.Schema.Types.ObjectId, ref: "Clients", default: null },

    items: [ItemSchema],

    reason: { type: String, default: "" },

    // ── Computed totals (pre-save) ────────────────────────────────────────────
    grand_total: { type: Number, default: 0 }, // sum of return_amounts

    // ── GST ───────────────────────────────────────────────────────────────────
    tax_mode: { type: String, enum: ["instate", "otherstate"], default: "instate" },
    cgst_pct: { type: Number, default: 0 },
    sgst_pct: { type: Number, default: 0 },
    igst_pct: { type: Number, default: 0 },
    cgst_amt: { type: Number, default: 0 }, // pre-save
    sgst_amt: { type: Number, default: 0 }, // pre-save
    igst_amt: { type: Number, default: 0 }, // pre-save
    total_tax: { type: Number, default: 0 }, // pre-save

    // ── Net credit amount (pre-save) ──────────────────────────────────────────
    net_amount: { type: Number, default: 0 }, // grand_total + total_tax

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Rejected"],
      default: "Draft",
    },

    narration:       { type: String, default: "" },
    created_by_user: { type: String, default: "" },

    // ── Journal Entry link (set on approval) ─────────────────────────────────
    je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:  { type: String, default: "" },   // snapshot: JE/25-26/0001
  },
  { timestamps: true }
);

// ── Pre-save: compute all derived fields ──────────────────────────────────────
ClientCNSchema.pre("save", function (next) {
  let grandTotal = 0;

  for (const item of this.items) {
    const rate      = Number(item.rate)       || 0;
    const returnQty = Number(item.return_qty) || 0;

    item.return_amount = round2(returnQty * rate);
    grandTotal += item.return_amount;
  }

  this.grand_total = round2(grandTotal);

  // GST — enforce tax_mode
  if (this.tax_mode === "otherstate") {
    this.cgst_pct = 0;
    this.sgst_pct = 0;
  } else {
    this.igst_pct = 0;
  }
  this.cgst_amt  = round2(this.grand_total * this.cgst_pct / 100);
  this.sgst_amt  = round2(this.grand_total * this.sgst_pct / 100);
  this.igst_amt  = round2(this.grand_total * this.igst_pct / 100);
  this.total_tax = round2(this.cgst_amt + this.sgst_amt + this.igst_amt);

  this.net_amount = round2(this.grand_total + this.total_tax);

  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────
ClientCNSchema.index({ client_id: 1, ccn_date: -1 });
ClientCNSchema.index({ status: 1, ccn_date: -1 });

const ClientCNModel = mongoose.model("ClientCreditNote", ClientCNSchema);
export default ClientCNModel;
