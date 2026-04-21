import crypto from "crypto";
import EInvoiceModel from "./einvoice.model.js";
import ClientBillingModel from "../clientbilling/clientbilling/clientbilling.model.js";
import ClientCNModel from "../clientcreditnote/clientcreditnote.model.js";
import logger from "../../../config/logger.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Indian state-code lookup (numeric, 2-digit, per GSTN) ─────────────────────
// Sufficient subset — extend as needed. Place-of-supply codes are these.
const STATE_CODE = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", "Punjab": "03",
  "Chandigarh": "04", "Uttarakhand": "05", "Haryana": "06", "Delhi": "07",
  "Rajasthan": "08", "Uttar Pradesh": "09", "Bihar": "10", "Sikkim": "11",
  "Arunachal Pradesh": "12", "Nagaland": "13", "Manipur": "14", "Mizoram": "15",
  "Tripura": "16", "Meghalaya": "17", "Assam": "18", "West Bengal": "19",
  "Jharkhand": "20", "Odisha": "21", "Chhattisgarh": "22", "Madhya Pradesh": "23",
  "Gujarat": "24", "Daman and Diu": "25", "Dadra and Nagar Haveli": "26",
  "Maharashtra": "27", "Andhra Pradesh": "28", "Karnataka": "29", "Goa": "30",
  "Lakshadweep": "31", "Kerala": "32", "Tamil Nadu": "33", "Puducherry": "34",
  "Andaman and Nicobar Islands": "35", "Telangana": "36",
  "Andhra Pradesh (New)": "37", "Ladakh": "38", "Other Territory": "97",
};

function stateCode(stateName) {
  if (!stateName) return "";
  const exact = STATE_CODE[stateName];
  if (exact) return exact;
  // Case-insensitive fallback
  const k = Object.keys(STATE_CODE).find(s => s.toLowerCase() === String(stateName).toLowerCase());
  return k ? STATE_CODE[k] : "";
}

// ── Build the IRP-conformant payload ──────────────────────────────────────────
// Conforms (loosely) to the NIC IRP "INV-1.1" schema. A real IRP will return
// non-2xx if any required field is wrong — keep this in sync with NIC docs.
function buildIrpPayload({ bill, supplier, doc_type, doc_no, doc_date, isCreditNote }) {
  const isInState = bill.tax_mode === "instate";
  const recipientGstin = (bill.client_gstin || "URP").toUpperCase();
  const billState = bill.client_state || "";

  const items = (bill.items || []).map((it, idx) => {
    const taxable = r2(it.current_amount || it.upto_date_amount || 0);
    const rate    = r2((bill.cgst_pct || 0) + (bill.sgst_pct || 0) + (bill.igst_pct || 0));
    const cgst    = isInState ? r2(taxable * (bill.cgst_pct || 0) / 100) : 0;
    const sgst    = isInState ? r2(taxable * (bill.sgst_pct || 0) / 100) : 0;
    const igst    = !isInState ? r2(taxable * (bill.igst_pct || 0) / 100) : 0;
    return {
      SlNo:         String(idx + 1),
      PrdDesc:      it.item_name || it.item_code || "Works contract service",
      IsServc:      "Y",
      HsnCd:        "9954",
      Qty:          Number(it.current_qty || it.upto_date_qty || 1),
      Unit:         it.unit || "OTH",
      UnitPrice:    Number(it.rate || 0),
      TotAmt:       taxable,
      Discount:     0,
      PreTaxVal:    taxable,
      AssAmt:       taxable,
      GstRt:        rate,
      CgstAmt:      cgst,
      SgstAmt:      sgst,
      IgstAmt:      igst,
      CesAmt:       0,
      CesNonAdvlAmt: 0,
      StateCesAmt:  0,
      StateCesNonAdvlAmt: 0,
      OthChrg:      0,
      TotItemVal:   r2(taxable + cgst + sgst + igst),
    };
  });

  const totals = {
    AssVal:    r2(bill.grand_total || 0),
    CgstVal:   r2(bill.cgst_amt   || 0),
    SgstVal:   r2(bill.sgst_amt   || 0),
    IgstVal:   r2(bill.igst_amt   || 0),
    CesVal:    0,
    StCesVal:  0,
    Discount:  0,
    OthChrg:   0,
    RndOffAmt: r2(bill.round_off || 0),
    TotInvVal: r2(bill.net_amount || 0),
  };

  return {
    Version:  "1.1",
    TranDtls: {
      TaxSch:   "GST",
      SupTyp:   "B2B",
      RegRev:   "N",
      EcmGstin: null,
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ:    doc_type,                 // INV / CRN / DBN
      No:     doc_no,
      Dt:     new Date(doc_date).toISOString().slice(0, 10).split("-").reverse().join("/"), // dd/mm/yyyy
    },
    SellerDtls: {
      Gstin: supplier.gstin,
      LglNm: supplier.legal_name || "",
      Addr1: supplier.address1 || "",
      Loc:   supplier.location || "",
      Pin:   Number(supplier.pin || 0) || 0,
      Stcd:  supplier.state_code,
    },
    BuyerDtls: {
      Gstin: recipientGstin,
      LglNm: bill.client_name || "",
      Pos:   stateCode(billState) || supplier.state_code,
      Addr1: bill.client_address || "Address not captured",
      Loc:   billState || "",
      Pin:   999999,
      Stcd:  stateCode(billState) || supplier.state_code,
    },
    ValDtls:  totals,
    ItemList: items,
    RefDtls:  isCreditNote ? {
      InvRm: "Reference to original invoice — see source_no",
    } : undefined,
  };
}

// ── Local IRN generator ───────────────────────────────────────────────────────
// Per IRP spec: IRN = SHA-256(supplier_gstin + doc_no + financial_year + doc_type)
// where financial_year is "YYYY-YY" (e.g. "2025-26") — note 4-digit start year.
function computeIrn({ supplier_gstin, doc_no, doc_date, doc_type }) {
  const d = new Date(doc_date);
  const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const fy      = `${fyStart}-${String(fyStart + 1).slice(-2)}`;
  const input   = `${supplier_gstin}${doc_no}${fy}${doc_type}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ── Minimal QR payload — what NIC encodes in the printed QR ──────────────────
// Real IRP QR is a signed JWT. This stub embeds the same FIELDS in a JSON
// (un-signed). Replace with the real signed JWT once IRP integration is live.
function buildQrPayload({ irn, ack_no, ack_date, supplier_gstin, recipient_gstin, doc_no, doc_type, doc_date, total_invoice_value, line_count, hsn_code }) {
  const payload = {
    Irn:    irn,
    Acknowledge: ack_no,
    AcknowledgeDate: new Date(ack_date).toISOString(),
    SellerGstin: supplier_gstin,
    BuyerGstin:  recipient_gstin,
    DocNo:       doc_no,
    DocTyp:      doc_type,
    DocDt:       new Date(doc_date).toISOString().slice(0, 10).split("-").reverse().join("/"),
    TotInvVal:   total_invoice_value,
    ItemCnt:     line_count,
    MainHsnCode: hsn_code,
    IrnDate:     new Date().toISOString(),
  };
  // IRP returns this base64-encoded inside a JWT; we just base64 the JSON.
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

// ── STUB: simulate the IRP /eivital/v1.04/Invoice POST ─────────────────────────
function simulateIrpAck({ payload, irn }) {
  const ackNo   = `ACK-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const ackDate = new Date();
  return {
    AckNo:   ackNo,
    AckDt:   ackDate,
    Irn:     irn,
    SignedInvoice: Buffer.from(JSON.stringify(payload)).toString("base64"),
    SignedQRCode:  buildQrPayload({
      irn,
      ack_no:  ackNo,
      ack_date: ackDate,
      supplier_gstin: payload.SellerDtls.Gstin,
      recipient_gstin: payload.BuyerDtls.Gstin,
      doc_no:  payload.DocDtls.No,
      doc_type: payload.DocDtls.Typ,
      doc_date: payload.DocDtls.Dt,
      total_invoice_value: payload.ValDtls.TotInvVal,
      line_count: payload.ItemList.length,
      hsn_code:   payload.ItemList[0]?.HsnCd || "9954",
    }),
  };
}

class EInvoiceService {
  // ── Fetch source bill (ClientBilling or ClientCN) ──────────────────────
  static async loadSource({ source_type, source_ref, source_no }) {
    if (!source_type) throw new Error("source_type is required");
    if (!source_ref && !source_no) throw new Error("source_ref or source_no is required");

    const Model = source_type === "ClientCreditNote" ? ClientCNModel : ClientBillingModel;
    const filter = {};
    if (source_ref) filter._id = source_ref;
    else            filter[source_type === "ClientCreditNote" ? "ccn_no" : "bill_id"] = source_no;

    const doc = await Model.findOne(filter).lean();
    if (!doc) throw new Error(`Source ${source_type} not found`);
    return doc;
  }

  // ── Generate (idempotent — returns existing if already generated) ───────
  static async generate({ source_type, source_ref, source_no, supplier, generated_by = "" }) {
    if (!supplier?.gstin)         throw new Error("supplier.gstin is required");
    if (!supplier?.state_code && !supplier?.state) {
      throw new Error("supplier.state_code or supplier.state is required");
    }

    // Resolve state_code from name if needed
    if (!supplier.state_code) supplier.state_code = stateCode(supplier.state);
    if (!supplier.state_code) throw new Error(`Cannot resolve state code for '${supplier.state}'`);

    const bill = await EInvoiceService.loadSource({ source_type, source_ref, source_no });

    // Idempotency: same source already generated?
    const existing = await EInvoiceModel.findOne({
      source_type,
      source_no: bill.bill_id || bill.ccn_no,
      status: { $in: ["generated", "draft"] },
    }).lean();
    if (existing && existing.status === "generated") {
      return { already_generated: true, einvoice: existing };
    }

    // E-invoice is mandatory only for B2B (recipient with valid GSTIN).
    // B2C invoices go through GSTR-1 directly without IRP.
    if (!bill.client_gstin) {
      throw new Error("E-invoice is only required for B2B (registered recipient). This bill has no client_gstin.");
    }

    const isCreditNote = source_type === "ClientCreditNote";
    const doc_type = isCreditNote ? "CRN" : (source_type === "DebitNote" ? "DBN" : "INV");
    const doc_no   = bill.bill_id || bill.ccn_no || bill.dn_no;
    const doc_date = bill.bill_date || bill.ccn_date || bill.dn_date || new Date();

    if (!doc_no) throw new Error("Source bill has no doc_no (bill_id/ccn_no)");

    const payload = buildIrpPayload({ bill, supplier, doc_type, doc_no, doc_date, isCreditNote });
    const irn     = computeIrn({ supplier_gstin: supplier.gstin, doc_no, doc_date, doc_type });

    let irpResult;
    try {
      irpResult = simulateIrpAck({ payload, irn });
    } catch (err) {
      logger.error(`[EInvoice] IRP call failed for ${doc_no}: ${err.message}`);
      const failed = await EInvoiceModel.create({
        source_type, source_ref: source_ref || null, source_no: doc_no,
        bill_date: doc_date,
        supplier_gstin: supplier.gstin, supplier_legal_name: supplier.legal_name || "",
        supplier_state_code: supplier.state_code,
        recipient_gstin: (bill.client_gstin || "URP").toUpperCase(),
        recipient_legal_name: bill.client_name || "",
        recipient_state_code: stateCode(bill.client_state),
        place_of_supply_state_code: stateCode(bill.client_state) || supplier.state_code,
        doc_type, doc_no, doc_date,
        taxable_value: r2(bill.grand_total || 0),
        cgst_amt: r2(bill.cgst_amt || 0),
        sgst_amt: r2(bill.sgst_amt || 0),
        igst_amt: r2(bill.igst_amt || 0),
        total_invoice_value: r2(bill.net_amount || 0),
        round_off: r2(bill.round_off || 0),
        line_items: payload.ItemList.map(li => ({
          sl_no: Number(li.SlNo), product_desc: li.PrdDesc, hsn_code: li.HsnCd,
          is_service: li.IsServc === "Y", quantity: li.Qty, unit: li.Unit,
          unit_price: li.UnitPrice, total_amount: li.TotAmt,
          discount: li.Discount, pre_tax_value: li.PreTaxVal,
          assessable_value: li.AssAmt, gst_rate: li.GstRt,
          cgst_amt: li.CgstAmt, sgst_amt: li.SgstAmt, igst_amt: li.IgstAmt,
          total_item_value: li.TotItemVal,
        })),
        status: "failed",
        irp_error: err.message,
        is_simulated: true,
        irp_provider: "STUB",
        generated_by, created_by: generated_by,
      });
      return { generated: false, error: err.message, einvoice: failed.toObject() };
    }

    const doc = await EInvoiceModel.findOneAndUpdate(
      { source_type, source_no: doc_no },
      {
        $set: {
          source_type, source_ref: source_ref || null, source_no: doc_no,
          bill_date: doc_date,
          supplier_gstin: supplier.gstin, supplier_legal_name: supplier.legal_name || "",
          supplier_state_code: supplier.state_code,
          recipient_gstin: (bill.client_gstin || "URP").toUpperCase(),
          recipient_legal_name: bill.client_name || "",
          recipient_state_code: stateCode(bill.client_state),
          place_of_supply_state_code: stateCode(bill.client_state) || supplier.state_code,
          doc_type, doc_no, doc_date,
          taxable_value: r2(bill.grand_total || 0),
          cgst_amt: r2(bill.cgst_amt || 0),
          sgst_amt: r2(bill.sgst_amt || 0),
          igst_amt: r2(bill.igst_amt || 0),
          total_invoice_value: r2(bill.net_amount || 0),
          round_off: r2(bill.round_off || 0),
          line_items: payload.ItemList.map(li => ({
            sl_no: Number(li.SlNo), product_desc: li.PrdDesc, hsn_code: li.HsnCd,
            is_service: li.IsServc === "Y", quantity: li.Qty, unit: li.Unit,
            unit_price: li.UnitPrice, total_amount: li.TotAmt,
            discount: li.Discount, pre_tax_value: li.PreTaxVal,
            assessable_value: li.AssAmt, gst_rate: li.GstRt,
            cgst_amt: li.CgstAmt, sgst_amt: li.SgstAmt, igst_amt: li.IgstAmt,
            total_item_value: li.TotItemVal,
          })),
          irn:        irpResult.Irn,
          ack_no:     irpResult.AckNo,
          ack_date:   irpResult.AckDt,
          qr_payload: irpResult.SignedQRCode,
          signed_invoice_b64: irpResult.SignedInvoice,
          status: "generated",
          is_simulated: true,
          irp_provider: "STUB",
          irp_error:    "",
          generated_by, generated_at: new Date(),
        },
        $setOnInsert: { created_by: generated_by },
      },
      { new: true, upsert: true },
    );

    return {
      generated: true,
      irn:    irpResult.Irn,
      ack_no: irpResult.AckNo,
      ack_dt: irpResult.AckDt,
      qr_payload: irpResult.SignedQRCode,
      einvoice: doc.toObject(),
    };
  }

  // ── Cancel an IRN (24-hour window per IRP rules) ──────────────────────
  // IRP allows cancellation only within 24 h of generation. This stub
  // enforces the same window; replace with real IRP cancel API when live.
  static async cancel({ id, reason = "", cancelled_by = "" }) {
    const doc = await EInvoiceModel.findById(id);
    if (!doc) throw new Error("E-Invoice not found");
    if (doc.status !== "generated") throw new Error(`Cannot cancel — current status is '${doc.status}'`);

    const generatedMs = new Date(doc.generated_at || doc.ack_date || doc.createdAt).getTime();
    const ageHours    = (Date.now() - generatedMs) / (1000 * 60 * 60);
    if (ageHours > 24) {
      throw new Error(`Cancellation window expired (${ageHours.toFixed(1)} hours since generation; limit is 24 h)`);
    }

    doc.status = "cancelled";
    doc.cancellation_reason = reason || "";
    doc.cancelled_at = new Date();
    doc.cancelled_by = cancelled_by || "";
    await doc.save();

    return { cancelled: true, einvoice: doc.toObject() };
  }

  static async list({ page = 1, limit = 50, status, doc_type, source_no, from_date, to_date, supplier_gstin } = {}) {
    const filter = { is_deleted: { $ne: true } };
    if (status)          filter.status = status;
    if (doc_type)        filter.doc_type = doc_type;
    if (source_no)       filter.source_no = source_no;
    if (supplier_gstin)  filter.supplier_gstin = supplier_gstin;
    if (from_date || to_date) {
      filter.doc_date = {};
      if (from_date) filter.doc_date.$gte = new Date(from_date);
      if (to_date)   filter.doc_date.$lte = new Date(to_date);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      EInvoiceModel.find(filter).sort({ doc_date: -1, createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      EInvoiceModel.countDocuments(filter),
    ]);
    return { rows, total, page: Number(page), limit: Number(limit) };
  }

  static async getById(id) {
    const doc = await EInvoiceModel.findById(id).lean();
    if (!doc) throw new Error("E-Invoice not found");
    return doc;
  }

  static async getByIrn(irn) {
    if (!irn) throw new Error("irn is required");
    const doc = await EInvoiceModel.findOne({ irn }).lean();
    if (!doc) throw new Error("E-Invoice not found");
    return doc;
  }

  // Returns the QR payload (decoded JSON for inspection) + base64 string
  // (for printing as a QR image — the FE can render via any QR library).
  static async getQr(id) {
    const doc = await EInvoiceModel.findById(id).lean();
    if (!doc) throw new Error("E-Invoice not found");
    if (!doc.qr_payload) throw new Error("E-Invoice has no QR yet");
    let decoded = null;
    try {
      decoded = JSON.parse(Buffer.from(doc.qr_payload, "base64").toString("utf8"));
    } catch (_err) {
      decoded = null;
    }
    return {
      irn:           doc.irn,
      qr_payload:    doc.qr_payload,
      qr_decoded:    decoded,
      print_friendly: {
        IRN:     doc.irn,
        AckNo:   doc.ack_no,
        AckDt:   doc.ack_date,
        Doc:     `${doc.doc_type} ${doc.doc_no}`,
        Total:   doc.total_invoice_value,
      },
    };
  }
}

export default EInvoiceService;
