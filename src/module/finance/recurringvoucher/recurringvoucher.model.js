import mongoose from "mongoose";

// ── Recurring Voucher Template ────────────────────────────────────────────────
//
// Stores a recipe for vouchers that recur on a schedule (rent, AMC, salary
// advance, internet bill, etc.). On each due date, a new ExpenseVoucher is
// auto-created from `template_payload` and the next_run_date advances.
//
// Currently supports: ExpenseVoucher (the most common case).
// Extending to PaymentVoucher / ReceiptVoucher is a future addition — the
// service dispatches on `voucher_type` so adding a new type is a one-place
// change.

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly", "custom_days"];

const GeneratedRefSchema = new mongoose.Schema(
  {
    voucher_type:  { type: String, default: "ExpenseVoucher" },
    voucher_ref:   { type: mongoose.Schema.Types.ObjectId, default: null },
    voucher_no:    { type: String, default: "" },
    generated_at:  { type: Date,   default: Date.now },
    failed:        { type: Boolean, default: false },
    error_message: { type: String, default: "" },
  },
  { _id: false }
);

const RecurringVoucherSchema = new mongoose.Schema(
  {
    // Auto-generated: RV-T/<seq>  (template, NOT financial-year scoped)
    template_no: { type: String, unique: true },

    // Display name shown in the UI list
    template_name: { type: String, required: true, trim: true },

    voucher_type: {
      type: String,
      enum: ["ExpenseVoucher"],   // expand later (PaymentVoucher, etc.)
      default: "ExpenseVoucher",
    },

    // ── Schedule ─────────────────────────────────────────────────────────
    frequency: { type: String, enum: FREQUENCIES, required: true },
    interval:  { type: Number, default: 1 },         // every N units (e.g. every 2 months)
    custom_days: { type: Number, default: 0 },        // only when frequency === "custom_days"

    start_date: { type: Date, required: true },
    end_date:   { type: Date, default: null },        // null = open-ended

    // For monthly/quarterly/yearly: which day-of-month to fire on (1-28 recommended).
    // 0 = use the same day as start_date.
    day_of_month: { type: Number, default: 0 },

    // ── Run state (managed by service) ───────────────────────────────────
    next_run_date: { type: Date, required: true, index: true },
    last_run_date: { type: Date, default: null },
    run_count:     { type: Number, default: 0 },

    // ── Lifecycle ────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["active", "paused", "ended"],
      default: "active",
    },

    // ── Template payload to clone ────────────────────────────────────────
    // Object matching ExpenseVoucherService.create(payload) shape — minus
    // ev_no (auto) and ev_date (set to run-date at generation).
    template_payload: { type: mongoose.Schema.Types.Mixed, required: true },

    // ── History ──────────────────────────────────────────────────────────
    generated_vouchers: { type: [GeneratedRefSchema], default: [] },

    narration:  { type: String, default: "" },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

RecurringVoucherSchema.index({ status: 1, next_run_date: 1 });

const RecurringVoucherModel = mongoose.model("RecurringVoucher", RecurringVoucherSchema);
export default RecurringVoucherModel;
