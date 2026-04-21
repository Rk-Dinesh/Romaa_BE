import mongoose from "mongoose";

// ── Retention Release ────────────────────────────────────────────────────────
//
// Records an event where retention money is paid back — either out to a
// contractor (payable side, account 2040) or received in from a client
// (receivable side, account 1060).
//
// Source data is the `retention_amt` on WeeklyBilling and `retention_amount`
// on ClientBilling. Each release cites one or more source bills via
// `bill_refs[]` with a partial `released_amt`, so a single release can
// consolidate retention held across multiple bills for the same party.
//
// release_no format:  RR/<FY>/<seq>   e.g.  RR/25-26/0001
//
// Lifecycle:
//   pending   → created, no JE
//   approved  → JE posted:
//                 Contractor side: Dr 2040 / Cr Bank
//                 Client side:     Dr Bank / Cr 1060
//               and bill.retention_released incremented
//   cancelled → reversing JE posted, bill.retention_released rolled back

const BillRefSchema = new mongoose.Schema(
  {
    bill_type:    { type: String, enum: ["WeeklyBilling", "ClientBilling"], required: true },
    bill_ref:     { type: mongoose.Schema.Types.ObjectId, required: true },
    bill_no:      { type: String, default: "" },
    bill_date:    { type: Date,   default: null },
    retention_amt: { type: Number, default: 0 }, // total retention withheld on that bill (snapshot)
    released_amt: { type: Number, required: true }, // amount being released NOW from this bill
  },
  { _id: false }
);

const RetentionReleaseSchema = new mongoose.Schema(
  {
    release_no:   { type: String, unique: true },      // RR/25-26/0001
    release_date: { type: Date, default: Date.now },
    financial_year:{ type: String, default: "" },      // "25-26"

    // Contractor = retention PAYABLE (we pay out)   → JE: Dr 2040 / Cr Bank
    // Client     = retention RECEIVABLE (we get it) → JE: Dr Bank / Cr 1060
    release_type: { type: String, enum: ["Contractor", "Client"], required: true },

    party_type:   { type: String, required: true },    // "Contractor" | "Client"
    party_id:     { type: String, required: true },    // contractor_id | client_id
    party_name:   { type: String, default: "" },

    tender_id:    { type: String, default: "", index: true },
    tender_name:  { type: String, default: "" },

    // Source bills this release settles (one release can cover many bills)
    bill_refs:    { type: [BillRefSchema], default: [] },
    total_released_amt: { type: Number, default: 0 },  // sum of bill_refs.released_amt

    // Banking side
    payment_mode:      { type: String, default: "NEFT" },
    bank_account_code: { type: String, default: "" },
    bank_name:         { type: String, default: "" },
    bank_ref:          { type: String, default: "" },   // UTR / cheque no.

    narration:  { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "approved", "cancelled"],
      default: "pending",
    },

    // Journal Entry link (set on approval)
    je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:  { type: String, default: "" },

    // Cancellation trail
    cancel_je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    cancel_je_no:  { type: String, default: "" },
    cancelled_at:  { type: Date, default: null },
    cancel_reason: { type: String, default: "" },

    // Audit
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    approved_at: { type: Date, default: null },
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    is_deleted:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

RetentionReleaseSchema.pre("save", function (next) {
  // Auto FY from release_date
  if (!this.financial_year) {
    const ref = this.release_date ? new Date(this.release_date) : new Date();
    const yr  = ref.getFullYear();
    const mo  = ref.getMonth() + 1;
    this.financial_year = mo >= 4
      ? `${String(yr).slice(2)}-${String(yr + 1).slice(2)}`
      : `${String(yr - 1).slice(2)}-${String(yr).slice(2)}`;
  }
  // Sum bill_refs into total
  this.total_released_amt = Math.round(
    (this.bill_refs || []).reduce((s, r) => s + (Number(r.released_amt) || 0), 0) * 100
  ) / 100;
  next();
});

RetentionReleaseSchema.index({ release_date: -1 });
RetentionReleaseSchema.index({ release_type: 1, status: 1 });
RetentionReleaseSchema.index({ party_type: 1, party_id: 1, status: 1 });
RetentionReleaseSchema.index({ tender_id: 1, status: 1 });
RetentionReleaseSchema.index({ "bill_refs.bill_ref": 1 });

const RetentionReleaseModel = mongoose.model("RetentionRelease", RetentionReleaseSchema);
export default RetentionReleaseModel;
