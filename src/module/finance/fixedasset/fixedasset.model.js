import mongoose from "mongoose";

// ── Fixed Asset Register ──────────────────────────────────────────────────────
//
// One FixedAsset document represents a capitalised asset tracked for depreciation
// and book-value reporting. This is a FINANCE view of assets — it may (optionally)
// link to a MachineryAsset record which tracks operational state.
//
// Each monthly depreciation run posts a JE (Dr depreciation_expense_account_code,
// Cr accumulated_depreciation_account_code) and appends a history row. The
// asset's running accumulated_depreciation + book_value are kept in sync.

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

const DEPRECIATION_METHODS = ["SLM", "WDV"];
const ASSET_STATUSES       = ["active", "disposed", "fully_depreciated", "archived"];

const DepreciationHistorySchema = new mongoose.Schema(
  {
    period_label:  { type: String, default: "" },   // e.g. "2025-04"
    period_start:  { type: Date,   default: null },
    period_end:    { type: Date,   default: null },
    method:        { type: String, default: "" },
    amount:        { type: Number, default: 0 },
    opening_nbv:   { type: Number, default: 0 },    // NBV before this charge
    closing_nbv:   { type: Number, default: 0 },    // NBV after this charge
    je_ref:        { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:         { type: String, default: "" },
    posted_at:     { type: Date,   default: Date.now },
  },
  { _id: false }
);

const DisposalSchema = new mongoose.Schema(
  {
    disposal_date:   { type: Date,   default: null },
    disposal_amount: { type: Number, default: 0 },
    gain_loss:       { type: Number, default: 0 },     // sale proceeds − NBV
    je_ref:          { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:           { type: String, default: "" },
    notes:           { type: String, default: "" },
  },
  { _id: false }
);

const FixedAssetSchema = new mongoose.Schema(
  {
    // Auto-generated: FA/<seq>  (not FY scoped — asset lives across years)
    asset_no: { type: String, unique: true },

    asset_name: { type: String, required: true, trim: true },
    category:   {
      type: String,
      enum: ["Plant & Machinery", "Vehicles", "Equipment & Tools", "Furniture & Fixtures", "Other"],
      default: "Plant & Machinery",
    },

    // Optional link to operational MachineryAsset record
    linked_machinery_id: { type: String, default: "" },
    linked_machinery_ref: { type: mongoose.Schema.Types.ObjectId, ref: "MachineryAsset", default: null },

    // ── Acquisition ───────────────────────────────────────────────────────
    acquisition_date: { type: Date,   required: true },
    acquisition_cost: { type: Number, required: true, min: 0 },
    salvage_value:    { type: Number, default: 0, min: 0 },

    // ── Depreciation setup ────────────────────────────────────────────────
    depreciation_method: { type: String, enum: DEPRECIATION_METHODS, default: "SLM" },
    useful_life_months:  { type: Number, default: 0 },      // required for SLM
    wdv_rate_pct:        { type: Number, default: 0 },      // annual %, required for WDV

    // ── Accounts (snapshotted from COA) ──────────────────────────────────
    asset_account_code:                { type: String, required: true },  // e.g. "1110"
    accumulated_depreciation_account_code: { type: String, required: true },  // e.g. "1110-DEP"
    depreciation_expense_account_code:    { type: String, required: true },  // e.g. "5410"

    // Optional tender allocation (for project-level depreciation charge)
    tender_id:  { type: String, default: "" },
    tender_ref: { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_name:{ type: String, default: "" },

    // ── Running state ─────────────────────────────────────────────────────
    accumulated_depreciation: { type: Number, default: 0 },
    book_value:               { type: Number, default: 0 },   // acquisition_cost − accumulated_depreciation
    last_depreciation_date:   { type: Date,   default: null },

    status: { type: String, enum: ASSET_STATUSES, default: "active" },

    // ── History ───────────────────────────────────────────────────────────
    depreciation_history: { type: [DepreciationHistorySchema], default: [] },
    disposal:             { type: DisposalSchema, default: null },

    narration:   { type: String, default: "" },
    created_by:  { type: String, default: "" },
  },
  { timestamps: true }
);

FixedAssetSchema.pre("save", function (next) {
  this.accumulated_depreciation = round2(this.accumulated_depreciation || 0);
  this.book_value = round2((this.acquisition_cost || 0) - this.accumulated_depreciation);
  if (this.book_value <= (this.salvage_value || 0) + 0.01 && this.status === "active") {
    this.status = "fully_depreciated";
  }
  next();
});

FixedAssetSchema.index({ status: 1, acquisition_date: -1 });
FixedAssetSchema.index({ tender_id: 1 });
FixedAssetSchema.index({ category: 1 });

const FixedAssetModel = mongoose.model("FixedAsset", FixedAssetSchema);
export default FixedAssetModel;
