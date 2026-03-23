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

    status: {
      type: String,
      enum: ["Generated", "Pending", "Paid", "Cancelled"],
      default: "Generated",
    },

    created_by: { type: String, default: "Site Engineer" },
  },
  { timestamps: true }
);

// ── Auto fin_year: Apr–Mar Indian financial year ──────────────────────────────
// Mar 2026 → "25-26"   Apr 2026 → "26-27"
// Computed from bill_date (or current date) so the frontend never needs to send it.
WeeklyBillingSchema.pre("save", function (next) {
  if (this.fin_year) return next(); // already set (e.g. re-save)

  const ref  = this.bill_date ? new Date(this.bill_date) : new Date();
  const yr   = ref.getFullYear();
  const mo   = ref.getMonth() + 1; // 1-12

  this.fin_year = mo >= 4
    ? `${String(yr).slice(2)}-${String(yr + 1).slice(2)}`   // "25-26"
    : `${String(yr - 1).slice(2)}-${String(yr).slice(2)}`;  // "24-25"

  next();
});

// Index for duplicate-bill check and list queries
WeeklyBillingSchema.index({ tender_id: 1, contractor_name: 1, from_date: 1, to_date: 1 });
WeeklyBillingSchema.index({ tender_id: 1, fin_year: 1 });

const WeeklyBillingModel = mongoose.model("WeeklyBilling", WeeklyBillingSchema);
export default WeeklyBillingModel;
