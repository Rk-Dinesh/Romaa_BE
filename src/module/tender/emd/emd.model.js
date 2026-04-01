import mongoose from "mongoose";

const proposalSchema = new mongoose.Schema({
  proposal_id: { type: String, required: true },
  company_name: { type: String, required: true },
  proposed_amount: { type: Number, required: true },
  emd_percentage: { type: Number, default: 0 },
  emd_amount: { type: Number },
  currency: { type: String, default: "INR" },
  payment_method: String,
  payment_bank: String,
  dd_no: String,
  payment_date: { type: Date, default: Date.now }, // Fixed: reference to Date.now
  status: { type: String, required: true, default: "PENDING" },
  refund_date: { type: Date, default: null },
  refund_reference: String,
  level: String,
  notes: String,
  approved_by: { type: String, default: "" },
  approved_date: { type: Date, default: null },
  rejection_reason: { type: String, default: "" },
  rejected_date: { type: Date, default: null },
  documents: [
    {
      doc_type: String,
      doc_url: String,
      uploaded_at: { type: Date, default: Date.now }
    }
  ]
});

// Calculate EMD amount. Note: This only runs on .save(), not .updateOne()
proposalSchema.pre("save", function (next) {
  if (this.proposed_amount && this.emd_percentage) {
    this.emd_amount = (this.proposed_amount * this.emd_percentage) / 100;
  }
  next();
});

const emdSchema = new mongoose.Schema(
  {
    tender_id: { type: String, required: true, index: true },
    emd_id: String,
    proposals: [proposalSchema],
    created_by_user: String
  },
  { timestamps: true }
);

const EmdModel = mongoose.model("Emds", emdSchema);
export default EmdModel;