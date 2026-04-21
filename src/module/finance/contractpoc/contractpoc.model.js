import mongoose from "mongoose";

// ── Contract POC (% of Completion) Snapshot ────────────────────────────────
//
// Persists the per-tender estimated-cost baseline and historical revisions
// used for Ind AS 115 Input-Method revenue recognition.
//
//   POC %        = costs_incurred / total_estimated_cost
//   Revenue Rec  = POC % × contract_value
//   WIP Adj      = Revenue Rec − Revenue Billed
//
// A single live record per tender (status = "active"); prior revisions are
// captured in `history[]` so auditors can trace estimate changes over time.

const RevisionSchema = new mongoose.Schema(
  {
    revised_on:             { type: Date, default: Date.now },
    revised_by:             { type: String, default: "" },
    previous_total_est_cost:{ type: Number, default: 0 },
    new_total_est_cost:     { type: Number, default: 0 },
    reason:                 { type: String, default: "" },
  },
  { _id: false },
);

const ContractPOCSchema = new mongoose.Schema(
  {
    tender_id:             { type: String, required: true, unique: true },
    tender_name:           { type: String, default: "" },
    contract_value:        { type: Number, required: true },
    total_estimated_cost:  { type: Number, required: true },      // EAC — Estimate At Completion
    status:                { type: String, enum: ["active", "closed"], default: "active" },
    history:               { type: [RevisionSchema], default: [] },
    last_recognized: {
      recognized_on:       { type: Date, default: null },
      poc_pct:             { type: Number, default: 0 },
      revenue_recognized:  { type: Number, default: 0 },
      cumulative_billed:   { type: Number, default: 0 },
      wip_adjustment:      { type: Number, default: 0 },
      je_ref:              { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
      je_no:               { type: String, default: "" },
    },

    // Trail of POC WIP postings (each snapshot may produce a posting + reversal).
    je_history: [{
      snapshot_on:         { type: Date },
      je_ref:              { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry" },
      je_no:               { type: String, default: "" },
      revenue_recognized:  { type: Number, default: 0 },
      wip_adjustment:      { type: Number, default: 0 },
      reversal_je_no:      { type: String, default: "" },
      _id: false,
    }],

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

ContractPOCSchema.index({ status: 1 });

const ContractPOCModel = mongoose.model("ContractPOC", ContractPOCSchema);
export default ContractPOCModel;
