import PurchaseBillModel from "./purchasebill.model.js";
import MaterialTransactionModel from "../../tender/materials/materialTransaction.model.js";

// Compute next doc_id for a given tender in the current FY
async function generateDocId(tender_id, seqOffset = 0) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  const financialYear = `${fyStart.toString().slice(-2)}-${(fyStart + 1).toString().slice(-2)}`;

  const prefix = `PB/${financialYear}/${tender_id}/`;
  const lastDoc = await PurchaseBillModel.findOne(
    { doc_id: { $regex: `^${prefix}` } },
    { doc_id: 1 }
  ).sort({ createdAt: -1 });

  const lastSeq = lastDoc ? parseInt(lastDoc.doc_id.split("/").pop(), 10) : 0;
  return `${prefix}${String(lastSeq + 1 + seqOffset).padStart(4, "0")}`;
}

function buildBillDoc(payload, doc_id) {
  return {
    doc_id,
    doc_date:             payload.doc_date            ? new Date(payload.doc_date) : new Date(),
    grn_bill_no:          payload.grn_bill_no         || "",
    grn_ref:              payload.grn_ref             || null,
    purchase_id:          payload.purchase_id         || "",
    purchase_ref:         payload.purchase_ref        || null,
    po_approved_date:     payload.po_approved_date    ? new Date(payload.po_approved_date) : null,
    invoice_no:           payload.invoice_no          || "",
    invoice_date:         payload.invoice_date        ? new Date(payload.invoice_date) : null,
    tender_id:            payload.tender_id           || "",
    tender_ref:           payload.tender_ref          || null,
    tender_project_name:  payload.tender_project_name || "",
    vendor_id:            payload.vendor_id           || "",
    vendor_ref:           payload.vendor_ref          || null,
    vendor_name:          payload.vendor_name         || "",
    gstin:                payload.gstin               || "",
    hsn_code:             payload.hsn_code            || "",
    type:                 payload.type                || "",
    tax_structure:        payload.tax_structure       || {},
    amount:               Number(payload.amount)      || 0,
  };
}

async function markGRNBilled(payload, doc_id) {
  const grnFilter = {};
  if (payload.grn_ref)      grnFilter._id         = payload.grn_ref;
  else if (payload.grn_bill_no) grnFilter.grn_bill_no = payload.grn_bill_no;
  if (!Object.keys(grnFilter).length) return;

  await MaterialTransactionModel.updateMany(
    { ...grnFilter, type: "IN" },
    { $set: { is_bill_generated: true, purchase_bill_id: doc_id } }
  );
}

class PurchaseBillService {
  // Single bill
  static async createPurchaseBill(payload) {
    const doc_id = await generateDocId(payload.tender_id || "");
    const saved  = await PurchaseBillModel.create(buildBillDoc(payload, doc_id));
    await markGRNBilled(payload, doc_id);
    return saved;
  }

  // Bulk bills — array payload or { bills: [] }
  static async createPurchaseBillBulk(items) {
    if (!Array.isArray(items) || items.length === 0)
      throw new Error("Payload must be a non-empty array of bills");

    // Group by tender_id to calculate sequential offsets per tender
    // so bills for the same tender in one batch get consecutive doc_ids
    const offsetMap = {}; // tender_id → next offset
    const docs = [];

    for (const payload of items) {
      const tender_id = payload.tender_id || "";
      if (offsetMap[tender_id] === undefined) offsetMap[tender_id] = 0;
      const seqOffset = offsetMap[tender_id]++;
      const doc_id = await generateDocId(tender_id, seqOffset);
      docs.push({ doc_id, payload });
    }

    const saved = await PurchaseBillModel.insertMany(
      docs.map(({ doc_id, payload }) => buildBillDoc(payload, doc_id))
    );

    // Update GRN flags for each bill
    await Promise.all(
      docs.map(({ doc_id, payload }) => markGRNBilled(payload, doc_id))
    );

    return saved;
  }
}

export default PurchaseBillService;
