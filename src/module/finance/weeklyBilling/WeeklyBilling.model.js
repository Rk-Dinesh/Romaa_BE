import mongoose from "mongoose";

// ── Bill Line Item ─────────────────────────────────────────────────────────────
const BillItemSchema = new mongoose.Schema(
  {
    work_order_id:    { type: String, required: true },
    item_description: { type: String, default: "" },
    description:      { type: String, default: "" },
    quantity:         { type: Number, default: 0 },
    unit:             { type: String, default: "" },
    quoted_rate:      { type: Number, default: 0 },
    amount:           { type: Number, default: 0 }, // quantity * quoted_rate
  },
  { _id: false }
);

// ── Weekly Bill ────────────────────────────────────────────────────────────────
const WeeklyBillingSchema = new mongoose.Schema(
  {
    bill_no: {
      type: String,
      unique: true,
      // auto-generated in pre-save hook below
    },

    tender_id:   { type: String, required: true, index: true },
    vendor_name: { type: String, required: true },

    from_date: { type: Date, required: true },
    to_date:   { type: Date, required: true },

    base_amount:  { type: Number, default: 0 },
    gst_pct:      { type: Number, default: 0 }, // e.g. 18
    gst_amount:   { type: Number, default: 0 },
    total_amount: { type: Number, default: 0 },

    work_order_ids: [{ type: String }],
    work_done_ids:  [{ type: String }],

    items: [BillItemSchema],

    status: {
      type: String,
      enum: ["Generated", "Pending", "Paid", "Cancelled"],
      default: "Generated",
    },

    created_by: { type: String, default: "Site Engineer" },
  },
  { timestamps: true }
);

// ── Auto bill_no: WB-YYYYMM-XXXX ─────────────────────────────────────────────
WeeklyBillingSchema.pre("save", async function (next) {
  if (this.bill_no) return next();

  const ym = new Date()
    .toISOString()
    .slice(0, 7)
    .replace("-", ""); // "202503"

  const count = await mongoose.model("WeeklyBilling").countDocuments();
  this.bill_no = `WB-${ym}-${String(count + 1).padStart(4, "0")}`;
  next();
});

// ── Index: fast lookup by tender + vendor + date range ────────────────────────
WeeklyBillingSchema.index({ tender_id: 1, vendor_name: 1, from_date: 1, to_date: 1 });

const WeeklyBillingModel = mongoose.model("WeeklyBilling", WeeklyBillingSchema);
export default WeeklyBillingModel;
