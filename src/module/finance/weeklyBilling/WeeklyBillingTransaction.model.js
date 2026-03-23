import mongoose from "mongoose";

// Replaces embedded items arrays inside WeeklyBilling sub_bills.
// Each dailyWorkDone line item is stored as a separate document here,
// preventing unbounded document growth and enabling efficient per-WO / per-WD queries.

const weeklyBillingTransactionSchema = new mongoose.Schema(
  {
    // ── Parent references ──────────────────────────────────────────────────
    bill_no:     { type: String, required: true, index: true }, // WB/TND-001/25-26/0001
    sub_bill_no: { type: String, required: true, index: true }, // WB/TND-001/25-26/0001/S01

    // ── Lookup fields (denormalised for query efficiency) ──────────────────
    tender_id:   { type: String, required: true, index: true },
    contractor_id:   { type: String, default: "" },
    contractor_name: { type: String, default: "" },
    fin_year:    { type: String, default: "" }, // "25-26"

    from_date: { type: Date },
    to_date:   { type: Date },

    // ── Traceability ───────────────────────────────────────────────────────
    work_order_id: { type: String, required: true, index: true }, // source work order
    work_done_id:  { type: String, required: true, index: true }, // source WorkOrderDone._id

    // ── Line item details ──────────────────────────────────────────────────
    item_description: { type: String, default: "" },
    description:      { type: String, default: "" },
    quantity:         { type: Number, default: 0 },
    unit:             { type: String, default: "" },
    quoted_rate:      { type: Number, default: 0 },
    amount:           { type: Number, default: 0 }, // quantity * quoted_rate

    // ── Status mirrors parent bill (updated on bill status change) ─────────
    status: {
      type: String,
      enum: ["Generated", "Pending", "Paid", "Cancelled"],
      default: "Generated",
    },
  },
  { timestamps: true }
);

// Common query patterns:
// 1. All items for a bill              → bill_no
// 2. All items for a sub-bill          → sub_bill_no
// 3. All items for a work order        → tender_id + work_order_id
// 4. All items from a work-done record → work_done_id
weeklyBillingTransactionSchema.index({ bill_no: 1, sub_bill_no: 1 });
weeklyBillingTransactionSchema.index({ tender_id: 1, work_order_id: 1 });
weeklyBillingTransactionSchema.index({ work_done_id: 1 });

const WeeklyBillingTransactionModel = mongoose.model(
  "WeeklyBillingTransaction",
  weeklyBillingTransactionSchema
);
export default WeeklyBillingTransactionModel;
