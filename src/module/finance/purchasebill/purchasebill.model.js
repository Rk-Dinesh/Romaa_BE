import mongoose from "mongoose";

const TaxStructureSchema = new mongoose.Schema(
  {
    igst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    cess: { type: Number, default: 0 },
  },
  { _id: false }
);

const PurchaseBillSchema = new mongoose.Schema(
  {
    doc_id:               { type: String, unique: true },
    doc_date:             { type: Date, default: Date.now },

    grn_bill_no:          { type: String, default: "" },
    grn_ref:              { type: mongoose.Schema.Types.ObjectId, ref: "MaterialTransaction", default: null },

    purchase_id:          { type: String, default: "" },
    purchase_ref:         { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseRequest", default: null },
    po_approved_date:     { type: Date, default: null },

    invoice_no:           { type: String, default: "" },
    invoice_date:         { type: Date, default: null },

    tender_id:            { type: String, default: "" },
    tender_ref:           { type: mongoose.Schema.Types.ObjectId, ref: "Tenders", default: null },
    tender_project_name:  { type: String, default: "" },

    vendor_id:            { type: String, default: "" },
    vendor_ref:           { type: mongoose.Schema.Types.ObjectId, ref: "Vendors", default: null },
    vendor_name:          { type: String, default: "" },
    gstin:                { type: String, default: "" },

    hsn_code:             { type: String, default: "" },
    type:                 { type: String, default: "" }, // HSN / SAC

    tax_structure:        { type: TaxStructureSchema, default: () => ({}) },
    

    amount:               { type: Number, default: 0 },
  },
  { timestamps: true }
);

const PurchaseBillModel = mongoose.model("PurchaseBill", PurchaseBillSchema);

export default PurchaseBillModel;
