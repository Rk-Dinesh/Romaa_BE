import mongoose from "mongoose";

// ── E-Invoice (IRN + QR) — STUB ───────────────────────────────────────────────
//
// Mandatory for B2B / Export invoices once aggregate turnover crosses the
// notified threshold (₹5 Cr from 1-Aug-2023 — verify current limit). The
// supplier must register each invoice with the Invoice Registration Portal
// (IRP) which returns:
//
//   • IRN     — 64-char SHA-256 hash assigned by IRP
//   • Ack No  — IRP acknowledgement number
//   • Ack Dt  — IRP acknowledgement timestamp
//   • QR      — signed JWT payload for the invoice (printed on hardcopy)
//
// THIS MODULE IS A STUB. We generate IRN + QR LOCALLY from the bill data
// (deterministic SHA-256). To go live, replace `simulateIrpAck()` in the
// service with a real IRP API call (NIC / Cleartax / Masters India / etc.)
// behind the `IRP_PROVIDER` env var.

const EWAY_BILL_SUB_SCHEMA = new mongoose.Schema(
  {
    eway_bill_no:   { type: String, default: "" },
    eway_bill_date: { type: Date,   default: null },
    valid_upto:     { type: Date,   default: null },
  },
  { _id: false },
);

const EInvoiceSchema = new mongoose.Schema(
  {
    // ── Source bill (link back to ClientBilling or ClientCreditNote) ─────
    source_type: {
      type: String,
      enum: ["ClientBilling", "ClientCreditNote", "DebitNote"],
      required: true,
      index: true,
    },
    source_ref:  { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    source_no:   { type: String, required: true, index: true }, // bill_id / ccn_no / dn_no
    bill_date:   { type: Date,   required: true },

    // ── Supplier (snapshotted from company profile at time of generation) ─
    supplier_gstin: { type: String, required: true },
    supplier_legal_name: { type: String, default: "" },
    supplier_state_code: { type: String, default: "" }, // 2-digit numeric

    // ── Recipient (snapshotted from ClientBilling) ────────────────────────
    recipient_gstin: { type: String, default: "URP" },  // "URP" = Unregistered Person
    recipient_legal_name: { type: String, default: "" },
    recipient_state_code: { type: String, default: "" },
    place_of_supply_state_code: { type: String, default: "" },
    is_export: { type: Boolean, default: false },

    // ── Invoice classification (per IRP doc_type codes) ───────────────────
    // INV: Tax Invoice, CRN: Credit Note, DBN: Debit Note
    doc_type: { type: String, enum: ["INV", "CRN", "DBN"], default: "INV" },
    doc_no:   { type: String, required: true },          // mirror of source_no
    doc_date: { type: Date,   required: true },          // mirror of bill_date

    // ── Totals ───────────────────────────────────────────────────────────
    taxable_value: { type: Number, default: 0 },
    cgst_amt:      { type: Number, default: 0 },
    sgst_amt:      { type: Number, default: 0 },
    igst_amt:      { type: Number, default: 0 },
    cess_amt:      { type: Number, default: 0 },
    other_charges: { type: Number, default: 0 },
    round_off:     { type: Number, default: 0 },
    total_invoice_value: { type: Number, default: 0 },

    // ── Line items (stripped to IRP minimum) ─────────────────────────────
    line_items: [{
      sl_no:         { type: Number, default: 1 },
      product_desc:  { type: String, default: "" },
      hsn_code:      { type: String, default: "" },
      is_service:    { type: Boolean, default: false },
      quantity:      { type: Number, default: 0 },
      unit:          { type: String, default: "OTH" },
      unit_price:    { type: Number, default: 0 },
      total_amount:  { type: Number, default: 0 },
      discount:      { type: Number, default: 0 },
      pre_tax_value: { type: Number, default: 0 },
      assessable_value: { type: Number, default: 0 },
      gst_rate:      { type: Number, default: 0 },
      cgst_amt:      { type: Number, default: 0 },
      sgst_amt:      { type: Number, default: 0 },
      igst_amt:      { type: Number, default: 0 },
      cess_amt:      { type: Number, default: 0 },
      total_item_value: { type: Number, default: 0 },
      _id: false,
    }],

    // ── IRP response (populated after generate) ──────────────────────────
    irn:        { type: String, default: "", index: true }, // 64-char hash
    ack_no:     { type: String, default: "" },
    ack_date:   { type: Date,   default: null },
    qr_payload: { type: String, default: "" },              // base64 / signed JWT
    signed_invoice_b64: { type: String, default: "" },      // IRP's signed invoice (full JWT)

    // ── E-Way Bill (optional — usually generated separately, but stored here) ─
    eway_bill: { type: EWAY_BILL_SUB_SCHEMA, default: null },

    // ── Status ──────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "generated", "cancelled", "failed"],
      default: "draft",
      index: true,
    },
    cancellation_reason: { type: String, default: "" },
    cancelled_at:        { type: Date,   default: null },
    cancelled_by:        { type: String, default: "" },

    // IRP error trace if failed
    irp_error: { type: String, default: "" },

    // Indicates whether the IRP call was a real network round-trip (false → STUB)
    is_simulated: { type: Boolean, default: true },
    irp_provider: { type: String,  default: "STUB" },

    // Audit
    generated_by:   { type: String, default: "" },
    generated_at:   { type: Date,   default: null },
    created_by:     { type: String, default: "" },
  },
  { timestamps: true },
);

EInvoiceSchema.index({ source_type: 1, source_ref: 1 });
EInvoiceSchema.index({ source_no: 1 }, { unique: false });
EInvoiceSchema.index({ status: 1, doc_date: -1 });

const EInvoiceModel = mongoose.model("EInvoice", EInvoiceSchema);
export default EInvoiceModel;
