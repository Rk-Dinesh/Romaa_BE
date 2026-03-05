import mongoose from "mongoose";

// Replaces the embedded inward_history / outward_history arrays that were growing
// unboundedly inside the MaterialModel document (hitting the 16MB BSON limit on
// active projects).  Each receive / issue event is now a separate document here.

const materialTransactionSchema = new mongoose.Schema(
  {
    tender_id: { type: String, required: true, index: true },
    item_id:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    item_description: { type: String, default: "" },

    // "IN" = received from vendor, "OUT" = issued to site/labour
    type: { type: String, enum: ["IN", "OUT"], required: true },

    quantity: { type: Number, required: true },
    date:     { type: Date, default: Date.now },

    // --- IN-specific fields ---
    purchase_request_ref: { type: String, default: "" },
    site_name:            { type: String, default: "" },
    vendor_name:          { type: String, default: "" },
    vendor_id:            { type: String, default: "" },
    invoice_challan_no:   { type: String, default: "" },
    received_by:          { type: String, default: "" },
    remarks:              { type: String, default: "" },

    // --- OUT-specific fields ---
    issued_to:        { type: String, default: "" },
    site_location:    { type: String, default: "" },
    work_description: { type: String, default: "" },
    issued_by:        { type: String, default: "" },
    priority_level:   { type: String, enum: ["Normal", "Urgent"], default: "Normal" },
  },
  { timestamps: true }
);

// Compound index for the two most common queries:
// 1. All transactions for an item   → { item_id, date }
// 2. All transactions for a PO ref  → { tender_id, purchase_request_ref }
materialTransactionSchema.index({ item_id: 1, date: -1 });
materialTransactionSchema.index({ tender_id: 1, purchase_request_ref: 1 });

const MaterialTransactionModel = mongoose.model("MaterialTransaction", materialTransactionSchema);
export default MaterialTransactionModel;
