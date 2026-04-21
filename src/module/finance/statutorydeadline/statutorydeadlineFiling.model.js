import mongoose from "mongoose";

// ── Statutory Deadline Filing Record ────────────────────────────────────────
//
// One row per actually-filed statutory return. The compound key
// (financial_year, category, form_name, period_label) uniquely matches a
// deadline entry produced by StatutoryDeadlineService.calendar() so the
// calendar view can light up filed items.

const StatutoryDeadlineFilingSchema = new mongoose.Schema(
  {
    financial_year: { type: String, required: true },   // "25-26"
    category:       { type: String, required: true },   // GST | TDS | Payroll | Income Tax | MCA
    form_name:      { type: String, required: true },   // GSTR-1, GSTR-3B, etc.
    period_label:   { type: String, required: true },   // "04-2025", "Q1 (Apr-Jun) 25-26", "25-26"

    filed_on:       { type: Date, required: true },
    filing_ref:     { type: String, default: "" },      // ARN / acknowledgement #
    amount_paid:    { type: Number, default: 0 },       // for returns with a payment component
    late_fee:       { type: Number, default: 0 },
    interest:       { type: Number, default: 0 },
    remarks:        { type: String, default: "" },

    filed_by:       { type: String, default: "" },

    // ── Audit fields ──────────────────────────────────────────────────────
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

StatutoryDeadlineFilingSchema.index(
  { financial_year: 1, category: 1, form_name: 1, period_label: 1 },
  { unique: true },
);

const StatutoryDeadlineFilingModel = mongoose.model(
  "StatutoryDeadlineFiling",
  StatutoryDeadlineFilingSchema,
);

export default StatutoryDeadlineFilingModel;
