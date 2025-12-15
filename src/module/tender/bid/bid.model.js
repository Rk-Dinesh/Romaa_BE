import mongoose from "mongoose";

const bidItemSchema = new mongoose.Schema(
  {
    item_id: String,                 // Unique code for  item (manual)
    item_name: String,               // Standard Work Classification Code (from BoQ or elsewhere)
    description: String,             // Description of bid item
    specifications: String,          // Specifications of bid item
    unit: String,                    // Unit of measurement (e.g., m3, Sqm, Kg)
    quantity: Number,                // Bid quantity
    base_rate: Number,               // BOQ/base rate (for comparison/reference)
    q_rate: Number,                  // Quoted rate by bidder
    n_rate: Number,                  // Negotiated/finalized rate
    base_amount: Number,             // quantity * base_rate
    q_amount: Number,                // quantity * q_rate (quoted amount)
    n_amount: Number,                // quantity * n_rate (negotiated amount)
    remarks: String,
    work_section: String,
  },
  { _id: false }
);


const bidSchema = new mongoose.Schema(
  {
    bid_id: { type: String, unique: true },         // Custom, auto-generated unique ID for the bid
    tender_id: String,                              // Parent tender reference
    phase: { type: String, default: "" },           // (Optional) Phase/stage of project for the bid
    revision: { type: Number, default: 1 },         // Revision number of the bid
    status: { type: String, default: "Draft" },     // Status: Draft, Submitted, Finalized, Cancelled
    items: [bidItemSchema],                         // Array of bid line items
    total_quote_amount: Number,                     // Sum of q_amount for all items
    total_negotiated_amount: Number,                // Sum of n_amount for all items
    prepared_by: { type: String, default: "" },     // User who prepared the bid
    approved_by: { type: String, default: "" },     // User who approved (if applicable)
    prepared_date: { type: Date, default: Date.now },   // Preparation date
    approved_date: { type: Date, default: null },       // Approval date
    attachments: [                                  // Files associated with bid submission
      {
        file_name: String,
        file_url: String,
        uploaded_at: { type: Date, default: Date.now }
      }
    ],
    created_by_user: { type: String, default: "ADMIN" },    // Origin user
    // Audit
    deleted: { type: Boolean, default: false },      // Soft-delete flag (optional)
  },
  { timestamps: true }
);

const BidModel = mongoose.model("Bids", bidSchema);

export default BidModel;
