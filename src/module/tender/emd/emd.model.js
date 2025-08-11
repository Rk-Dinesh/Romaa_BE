import mongoose from "mongoose";

const proposalSchema = new mongoose.Schema(
  {
    
    company_name: { type: String, required: true },   // Name of bidding company
    proposed_amount: { type: Number, required: true },// Tender bid value proposed by company
    emd_percentage: { type: Number, required: true }, // % of proposed amount for EMD
    emd_amount: { type: Number },                     // EMD amount = proposed_amount * emd_percentage / 100
    currency: { type: String, default: "INR" },
    payment_method: String,
    payment_reference: String,
    payment_date: Date,
    status: { type: String, required: true },         // PAID, REFUNDED, FORFEITED, PENDING
    refund_date: Date,
    refund_reference: String,
    level: String,                                    // General, Special, etc
    notes: String,
    documents: [
      {
        doc_type: String,
        doc_url: String,
        uploaded_at: Date
      }
    ]
  },
  { _id: false }
);

// Automatically calculate EMD amount before saving
proposalSchema.pre("save", function (next) {
  if (this.proposed_amount && this.emd_percentage) {
    this.emd_amount = (this.proposed_amount * this.emd_percentage) / 100;
  }
  next();
});

const emdSchema = new mongoose.Schema(
  {
    tender_id: { type: String, required: true },
    proposals: [proposalSchema],                 // Multiple companies can be listed here
    created_by_user: String
  },
  { timestamps: true }
);

const EmdModel = mongoose.model("Emds", emdSchema);

export default EmdModel;
