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

// ── Income Tax Act, Section 32 — Block of Assets ─────────────────────────────
// Parallel "tax book" depreciation runs alongside the Companies Act book.
// Always WDV. Half-rate applies if the asset is put-to-use for < 180 days
// in its year of acquisition (it_acquired_in_year_half=true).
//
// Standard block rates (Income Tax Rules, Appendix I) — surface as a
// recommendation; user can override per-asset via it_rate_pct.
const IT_BLOCKS = [
  "Building-Residential",        // 5%
  "Building-Other",              // 10%
  "Furniture & Fittings",        // 10%
  "Plant & Machinery-General",   // 15%
  "Motor Cars-Personal",         // 15%
  "Motor Vehicles-Commercial",   // 30%
  "Computer & Software",         // 40%
  "Books-Annual",                // 40%
  "Pollution Control",           // 40%
  "Energy Saving Devices",       // 40%
  "Intangible Assets",           // 25%
  "Other",
];

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

    // ── Income Tax Act, Section 32 — parallel "tax book" ─────────────────
    // Tracked alongside the Companies Act book but does NOT post journal
    // entries — book-vs-tax differences are reconciled in the income tax
    // return via deferred tax provisions at year-end.
    //
    // Always WDV. If the asset was put to use for < 180 days in its year
    // of acquisition, claim only 50% of the year's rate (half-year rule).
    it_block:                 { type: String, enum: IT_BLOCKS, default: "Plant & Machinery-General" },
    it_rate_pct:              { type: Number, default: 15 },           // annual WDV %
    it_acquired_in_year_half: { type: Boolean, default: false },       // true → half-rate in acquisition year
    it_accumulated_depreciation: { type: Number, default: 0 },
    it_book_value:            { type: Number, default: 0 },            // cost − it_accumulated_dep (WDV)
    it_last_depreciation_fy:  { type: String, default: "" },           // last FY computed e.g. "25-26"
    it_depreciation_history:  {
      type: [{
        financial_year: { type: String, default: "" },
        opening_wdv:    { type: Number, default: 0 },
        additions:      { type: Number, default: 0 },   // for future asset additions to the block (manual)
        deletions:      { type: Number, default: 0 },   // disposal proceeds reducing block
        rate_pct:       { type: Number, default: 0 },
        half_rate_applied: { type: Boolean, default: false },
        depreciation:   { type: Number, default: 0 },
        closing_wdv:    { type: Number, default: 0 },
        posted_at:      { type: Date,   default: Date.now },
      }],
      default: [],
    },

    narration:   { type: String, default: "" },
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted:  { type: Boolean, default: false },
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
