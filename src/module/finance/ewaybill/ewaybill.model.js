import mongoose from "mongoose";

// ── E-Way Bill — STUB ─────────────────────────────────────────────────────────
//
// Generated under Rule 138 of CGST Rules for movement of goods > ₹50,000 (or
// notified threshold) across state or intra-state boundaries. The E-Way Bill
// portal (NIC ewaybillgst.gov.in) is separate from the IRP — typical flow:
//
//   1. Supplier generates E-Invoice (IRN)        → E-Invoice module
//   2. Supplier generates E-Way Bill (EWB No)    → THIS module
//   3. Transporter updates Part B (vehicle no)   → can be done post-issue
//   4. E-Way Bill valid until (distance / 200 km → 1 day)
//
// THIS IS A STUB — EWB number is generated locally from SHA-256. Replace
// `simulateEwbAck()` with a real NIC / Cleartax API call to go live.

const TRANSPORTER_SCHEMA = new mongoose.Schema(
  {
    transporter_id:   { type: String, default: "" },   // GSTIN/TRANSIN of transporter
    transporter_name: { type: String, default: "" },
    vehicle_no:       { type: String, default: "" },   // Part B
    vehicle_type:     { type: String, enum: ["Regular", "ODC"], default: "Regular" },
    trans_mode:       { type: String, enum: ["Road", "Rail", "Air", "Ship", ""], default: "Road" },
    trans_doc_no:     { type: String, default: "" },   // LR/RR/Airway Bill no
    trans_doc_date:   { type: Date,   default: null },
    distance_km:      { type: Number, default: 0 },
  },
  { _id: false },
);

const EwayBillSchema = new mongoose.Schema(
  {
    // ── Link to source (ClientBilling or PurchaseBill or stock transfer) ─
    source_type: {
      type: String,
      enum: ["ClientBilling", "ClientCreditNote", "PurchaseBill", "DebitNote", "StockTransfer", "Other"],
      required: true,
      index: true,
    },
    source_ref:  { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    source_no:   { type: String, required: true, index: true },
    bill_date:   { type: Date,   required: true },

    // ── Link to E-Invoice (if bill has one already) ──────────────────────
    einvoice_ref: { type: mongoose.Schema.Types.ObjectId, ref: "EInvoice", default: null },
    irn:          { type: String, default: "" },

    // ── Parties ──────────────────────────────────────────────────────────
    supplier_gstin:      { type: String, required: true },
    supplier_legal_name: { type: String, default: "" },
    supplier_state_code: { type: String, required: true },
    dispatch_from: {
      address1: { type: String, default: "" },
      location: { type: String, default: "" },
      pincode:  { type: String, default: "" },
      state_code: { type: String, default: "" },
    },

    recipient_gstin:      { type: String, default: "URP" },
    recipient_legal_name: { type: String, default: "" },
    recipient_state_code: { type: String, default: "" },
    ship_to: {
      address1: { type: String, default: "" },
      location: { type: String, default: "" },
      pincode:  { type: String, default: "" },
      state_code: { type: String, default: "" },
    },

    // ── Document details ────────────────────────────────────────────────
    sub_supply_type: {
      // Per NIC subSupplyType codes
      type: String,
      enum: ["Supply", "Import", "Export", "Job Work", "For Own Use", "Job work Returns", "Sales Return", "Others", "SKD/CKD", "Line Sales", "Recipient Not Known", "Exhibition or Fairs"],
      default: "Supply",
    },
    supply_type: {
      type: String,
      enum: ["Outward", "Inward"],
      default: "Outward",
    },
    doc_type: {
      type: String,
      enum: ["Tax Invoice", "Bill of Supply", "Bill of Entry", "Credit Note", "Delivery Challan", "Other"],
      default: "Tax Invoice",
    },
    doc_no:   { type: String, required: true },
    doc_date: { type: Date,   required: true },

    // ── Item totals (summary only — EWB doesn't need full line items) ────
    total_value:      { type: Number, default: 0 }, // gross
    cgst_amt:         { type: Number, default: 0 },
    sgst_amt:         { type: Number, default: 0 },
    igst_amt:         { type: Number, default: 0 },
    cess_amt:         { type: Number, default: 0 },
    total_invoice_value: { type: Number, default: 0 },

    // Representative HSN / description — EWB requires at least one
    main_hsn_code:    { type: String, default: "" },
    main_description: { type: String, default: "" },

    // ── Transporter (Part A + B) ─────────────────────────────────────────
    transporter: { type: TRANSPORTER_SCHEMA, default: () => ({}) },

    // ── NIC response ─────────────────────────────────────────────────────
    ewb_no:      { type: String, default: "", index: true },
    ewb_date:    { type: Date,   default: null },
    valid_upto:  { type: Date,   default: null },

    // Part B update history (vehicle changes)
    part_b_updates: [{
      updated_at:   { type: Date, default: Date.now },
      vehicle_no:   { type: String, default: "" },
      from_place:   { type: String, default: "" },
      reason:       { type: String, default: "" },
      _id: false,
    }],

    // ── Status ──────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "generated", "cancelled", "expired", "failed"],
      default: "draft",
      index: true,
    },
    cancellation_reason: { type: String, default: "" },
    cancelled_at:        { type: Date,   default: null },
    cancelled_by:        { type: String, default: "" },
    nic_error:           { type: String, default: "" },

    // STUB marker
    is_simulated: { type: Boolean, default: true },
    ewb_provider: { type: String,  default: "STUB" },

    // Audit
    generated_by: { type: String, default: "" },
    generated_at: { type: Date,   default: null },
    created_by:   { type: String, default: "" },
  },
  { timestamps: true },
);

EwayBillSchema.index({ source_type: 1, source_ref: 1 });
EwayBillSchema.index({ ewb_no: 1 });
EwayBillSchema.index({ status: 1, doc_date: -1 });

const EwayBillModel = mongoose.model("EwayBill", EwayBillSchema);
export default EwayBillModel;
