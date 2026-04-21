import crypto from "crypto";
import EwayBillModel from "./ewaybill.model.js";
import EInvoiceModel from "../einvoice/einvoice.model.js";
import ClientBillingModel from "../clientbilling/clientbilling/clientbilling.model.js";
import PurchaseBillModel from "../purchasebill/purchasebill.model.js";
import logger from "../../../config/logger.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// EWB validity rule (simplified):
//   • Regular vehicle: 1 day per 200 km, rounded up
//   • ODC (over-dimensional cargo): 1 day per 20 km, rounded up
//   • Minimum 1 day
function computeValidity({ distance_km = 0, vehicle_type = "Regular", ewb_date }) {
  const d = Math.max(1, Number(distance_km) || 0);
  const perDay = vehicle_type === "ODC" ? 20 : 200;
  const days   = Math.max(1, Math.ceil(d / perDay));
  const from   = new Date(ewb_date);
  // Expiry is end-of-day on the last valid day
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 23, 59, 59, 999);
  return { valid_days: days, valid_upto: to };
}

// Deterministic 12-digit EWB number (local STUB).
// Real NIC EWB numbers are 12 digits starting with quarter indicator, assigned
// by their portal. This shim generates something visually similar for UI testing.
function computeEwbNo({ supplier_gstin, doc_no, doc_date }) {
  const hash = crypto.createHash("sha256")
    .update(`${supplier_gstin}${doc_no}${doc_date}`).digest("hex");
  // 12 digits derived from the hash
  let out = "";
  for (let i = 0; i < hash.length && out.length < 12; i++) {
    const c = hash[i];
    if (/[0-9]/.test(c)) out += c;
  }
  // Pad with deterministic digits from more of the hash if needed
  while (out.length < 12) out += String(parseInt(hash[out.length % hash.length], 16) % 10);
  return out.slice(0, 12);
}

function simulateNicAck({ ewb_no, ewb_date, valid_upto }) {
  return { ewbNo: ewb_no, ewbDate: ewb_date, validUpto: valid_upto };
}

class EwayBillService {
  // ── Load source bill (ClientBilling or PurchaseBill) ───────────────────
  static async loadSource({ source_type, source_ref, source_no }) {
    if (!source_type) throw new Error("source_type is required");
    if (!source_ref && !source_no) throw new Error("source_ref or source_no is required");

    let Model;
    let keyField;
    switch (source_type) {
      case "ClientBilling":       Model = ClientBillingModel; keyField = "bill_id"; break;
      case "PurchaseBill":        Model = PurchaseBillModel;  keyField = "doc_id";  break;
      default:
        throw new Error(`Unsupported source_type '${source_type}' for auto-load (pass manual fields instead)`);
    }
    const filter = {};
    if (source_ref) filter._id = source_ref;
    else            filter[keyField] = source_no;

    const doc = await Model.findOne(filter).lean();
    if (!doc) throw new Error(`Source ${source_type} not found`);
    return doc;
  }

  // ── Generate an EWB ────────────────────────────────────────────────────
  static async generate({
    source_type, source_ref, source_no,
    supplier,
    dispatch_from, ship_to,
    sub_supply_type = "Supply", supply_type = "Outward", doc_type = "Tax Invoice",
    transporter = {},
    main_hsn_code = "", main_description = "",
    total_value, cgst_amt, sgst_amt, igst_amt, cess_amt, total_invoice_value,
    doc_no, doc_date,
    generated_by = "",
  }) {
    if (!supplier?.gstin) throw new Error("supplier.gstin is required");
    if (!supplier?.state_code) throw new Error("supplier.state_code is required");

    // Auto-load from source if not passed
    let bill = null;
    if (source_type && (source_ref || source_no) && source_type !== "Other") {
      try {
        bill = await EwayBillService.loadSource({ source_type, source_ref, source_no });
      } catch (e) {
        if (!doc_no || !doc_date) throw e;
      }
    }

    const resolvedDocNo   = doc_no   || bill?.bill_id || bill?.doc_id;
    const resolvedDocDate = doc_date || bill?.bill_date;
    if (!resolvedDocNo)   throw new Error("doc_no could not be resolved");
    if (!resolvedDocDate) throw new Error("doc_date could not be resolved");

    const gt = total_value        ?? bill?.grand_total ?? 0;
    const ci = cgst_amt           ?? bill?.cgst_amt    ?? 0;
    const si = sgst_amt           ?? bill?.sgst_amt    ?? 0;
    const ii = igst_amt           ?? bill?.igst_amt    ?? 0;
    const cs = cess_amt           ?? 0;
    const tv = total_invoice_value ?? bill?.net_amount ?? (gt + ci + si + ii);

    // Fetch linked EInvoice (optional — for IRN cross-reference)
    let einv = null;
    if (source_type && source_no) {
      einv = await EInvoiceModel.findOne({ source_type, source_no: resolvedDocNo }).lean();
    }

    // Idempotency: same source already has an active EWB?
    const existing = await EwayBillModel.findOne({
      source_type, source_no: resolvedDocNo,
      status: { $in: ["generated"] },
    }).lean();
    if (existing) {
      return { already_generated: true, ewaybill: existing };
    }

    const ewb_date = new Date();
    const ewb_no   = computeEwbNo({
      supplier_gstin: supplier.gstin,
      doc_no: resolvedDocNo,
      doc_date: new Date(resolvedDocDate).toISOString().slice(0, 10),
    });

    const { valid_days, valid_upto } = computeValidity({
      distance_km: transporter.distance_km || 0,
      vehicle_type: transporter.vehicle_type || "Regular",
      ewb_date,
    });

    try {
      simulateNicAck({ ewb_no, ewb_date, valid_upto });
    } catch (err) {
      logger.error(`[EwayBill] NIC call failed for ${resolvedDocNo}: ${err.message}`);
      const failed = await EwayBillModel.create({
        source_type, source_ref: source_ref || null, source_no: resolvedDocNo,
        bill_date: resolvedDocDate,
        einvoice_ref: einv?._id || null, irn: einv?.irn || "",
        supplier_gstin: supplier.gstin,
        supplier_legal_name: supplier.legal_name || "",
        supplier_state_code: supplier.state_code,
        dispatch_from: dispatch_from || {},
        recipient_gstin: (bill?.client_gstin || "URP").toUpperCase(),
        recipient_legal_name: bill?.client_name || "",
        recipient_state_code: bill?.client_state_code || "",
        ship_to: ship_to || {},
        sub_supply_type, supply_type, doc_type,
        doc_no: resolvedDocNo, doc_date: resolvedDocDate,
        total_value: r2(gt), cgst_amt: r2(ci), sgst_amt: r2(si), igst_amt: r2(ii), cess_amt: r2(cs),
        total_invoice_value: r2(tv),
        main_hsn_code: main_hsn_code || "9954",
        main_description: main_description || "Works contract service",
        transporter,
        status: "failed", nic_error: err.message,
        is_simulated: true, ewb_provider: "STUB",
        generated_by, created_by: generated_by,
      });
      return { generated: false, error: err.message, ewaybill: failed.toObject() };
    }

    const doc = await EwayBillModel.findOneAndUpdate(
      { source_type, source_no: resolvedDocNo },
      {
        $set: {
          source_type, source_ref: source_ref || null, source_no: resolvedDocNo,
          bill_date: resolvedDocDate,
          einvoice_ref: einv?._id || null, irn: einv?.irn || "",
          supplier_gstin: supplier.gstin,
          supplier_legal_name: supplier.legal_name || "",
          supplier_state_code: supplier.state_code,
          dispatch_from: dispatch_from || {},
          recipient_gstin: (bill?.client_gstin || "URP").toUpperCase(),
          recipient_legal_name: bill?.client_name || "",
          recipient_state_code: bill?.client_state_code || "",
          ship_to: ship_to || {},
          sub_supply_type, supply_type, doc_type,
          doc_no: resolvedDocNo, doc_date: resolvedDocDate,
          total_value: r2(gt), cgst_amt: r2(ci), sgst_amt: r2(si), igst_amt: r2(ii), cess_amt: r2(cs),
          total_invoice_value: r2(tv),
          main_hsn_code: main_hsn_code || "9954",
          main_description: main_description || "Works contract service",
          transporter,
          ewb_no, ewb_date, valid_upto,
          status: "generated", nic_error: "",
          is_simulated: true, ewb_provider: "STUB",
          generated_by, generated_at: new Date(),
        },
        $setOnInsert: { created_by: generated_by },
      },
      { new: true, upsert: true },
    );

    return {
      generated: true,
      ewb_no, ewb_date, valid_upto, valid_days,
      ewaybill: doc.toObject(),
    };
  }

  // ── Update Part B (vehicle no change in transit) ───────────────────────
  static async updatePartB({ id, vehicle_no, from_place = "", reason = "", updated_by = "" }) {
    if (!vehicle_no) throw new Error("vehicle_no is required");
    const doc = await EwayBillModel.findById(id);
    if (!doc) throw new Error("E-Way Bill not found");
    if (doc.status !== "generated") throw new Error(`Cannot update Part B — status is '${doc.status}'`);

    doc.transporter = doc.transporter || {};
    doc.transporter.vehicle_no = vehicle_no;
    doc.part_b_updates.push({ updated_at: new Date(), vehicle_no, from_place, reason });
    await doc.save();

    return { updated: true, ewaybill: doc.toObject(), updated_by };
  }

  // ── Cancel an EWB (within 24 hours of generation, per NIC rules) ──────
  static async cancel({ id, reason = "", cancelled_by = "" }) {
    const doc = await EwayBillModel.findById(id);
    if (!doc) throw new Error("E-Way Bill not found");
    if (doc.status !== "generated") throw new Error(`Cannot cancel — current status is '${doc.status}'`);

    const ageHours = (Date.now() - new Date(doc.ewb_date || doc.generated_at || doc.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > 24) {
      throw new Error(`Cancellation window expired (${ageHours.toFixed(1)} hours; limit is 24 h)`);
    }

    doc.status = "cancelled";
    doc.cancellation_reason = reason || "";
    doc.cancelled_at = new Date();
    doc.cancelled_by = cancelled_by || "";
    await doc.save();

    return { cancelled: true, ewaybill: doc.toObject() };
  }

  // ── Mark expired (for scheduled cleanup / cron) ───────────────────────
  static async markExpired() {
    const now = new Date();
    const result = await EwayBillModel.updateMany(
      { status: "generated", valid_upto: { $lt: now } },
      { $set: { status: "expired" } },
    );
    return { matched: result.matchedCount, modified: result.modifiedCount };
  }

  static async list({ page = 1, limit = 50, status, source_type, supplier_gstin, from_date, to_date, q } = {}) {
    const filter = { is_deleted: { $ne: true } };
    if (status)          filter.status          = status;
    if (source_type)     filter.source_type     = source_type;
    if (supplier_gstin)  filter.supplier_gstin  = supplier_gstin;
    if (from_date || to_date) {
      filter.doc_date = {};
      if (from_date) filter.doc_date.$gte = new Date(from_date);
      if (to_date)   filter.doc_date.$lte = new Date(to_date);
    }
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ ewb_no: rx }, { doc_no: rx }, { source_no: rx }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      EwayBillModel.find(filter).sort({ doc_date: -1, createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      EwayBillModel.countDocuments(filter),
    ]);
    return { rows, total, page: Number(page), limit: Number(limit) };
  }

  static async getById(id) {
    const doc = await EwayBillModel.findById(id).lean();
    if (!doc) throw new Error("E-Way Bill not found");
    return doc;
  }

  static async getByEwbNo(ewb_no) {
    if (!ewb_no) throw new Error("ewb_no is required");
    const doc = await EwayBillModel.findOne({ ewb_no }).lean();
    if (!doc) throw new Error("E-Way Bill not found");
    return doc;
  }
}

export default EwayBillService;
