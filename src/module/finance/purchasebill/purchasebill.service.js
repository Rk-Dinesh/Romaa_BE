import PurchaseBillModel from "./purchasebill.model.js";
import MaterialTransactionModel from "../../tender/materials/materialTransaction.model.js";

// ── Build document from payload ───────────────────────────────────────────────
// Only source fields are mapped here.
// Computed fields (cgst_amt, tax_groups, grand_total, total_tax, round_off,
// net_amount, due_date) are calculated automatically by the pre-save hook.

function buildDoc(payload, doc_id) {
  return {
    doc_id,

    doc_date:     payload.doc_date     ? new Date(payload.doc_date)     : new Date(),
    invoice_no:   payload.invoice_no   || "",
    invoice_date: payload.invoice_date ? new Date(payload.invoice_date) : null,
    credit_days:  Number(payload.credit_days) || 0,
    narration:    payload.narration    || "",

    tender_id:   payload.tender_id   || "",
    tender_ref:  payload.tender_ref  || null,
    tender_name: payload.tender_name || "",

    vendor_id:    payload.vendor_id    || "",
    vendor_ref:   payload.vendor_ref   || null,
    vendor_name:  payload.vendor_name  || "",
    vendor_gstin: payload.vendor_gstin || "",

    place_of_supply: payload.place_of_supply || "InState",
    tax_mode:        payload.tax_mode        || "instate",

    grn_rows: (payload.grn_rows || []).map((r) => ({
      grn_no:   r.grn_no  || "",
      grn_ref:  r.grn_ref || null,
      ref_date: r.ref_date ? new Date(r.ref_date) : null,
      grn_qty:  Number(r.grn_qty) || 0,
    })),

    // Only pass source fields — pre-save derives cgst_amt, sgst_amt, igst_amt, net_amt
    line_items: (payload.line_items || []).map((i) => ({
      item_id:          i.item_id          || null,
      item_description: i.item_description || "",
      unit:             i.unit             || "",
      accepted_qty:     Number(i.accepted_qty) || 0,
      unit_price:       Number(i.unit_price)   || 0,
      gross_amt:        Number(i.gross_amt)    || 0,
      cgst_pct:         Number(i.cgst_pct)     || 0,
      sgst_pct:         Number(i.sgst_pct)     || 0,
      igst_pct:         Number(i.igst_pct)     || 0,
    })),

    // Only pass source fields — pre-save derives net and applies deduction sign
    additional_charges: (payload.additional_charges || []).map((c) => ({
      type:         c.type         || "",
      amount:       Number(c.amount)   || 0,
      gst_pct:      Number(c.gst_pct)  || 0,
      is_deduction: Boolean(c.is_deduction),
    })),

    status: payload.status || "pending",
  };
}

// ── Mark linked GRN transactions as billed ────────────────────────────────────

async function markGRNsBilled(grn_rows, doc_id) {
  if (!grn_rows || grn_rows.length === 0) return;

  const refs  = grn_rows.map((r) => r.grn_ref).filter(Boolean);
  const names = grn_rows.map((r) => r.grn_no).filter(Boolean);
  if (refs.length === 0 && names.length === 0) return;

  const filter = { type: "IN" };
  if (refs.length && names.length) {
    filter.$or = [{ _id: { $in: refs } }, { grn_bill_no: { $in: names } }];
  } else if (refs.length) {
    filter._id = { $in: refs };
  } else {
    filter.grn_bill_no = { $in: names };
  }

  await MaterialTransactionModel.updateMany(
    filter,
    { $set: { is_bill_generated: true, purchase_bill_id: doc_id } }
  );
}

// ── Service ───────────────────────────────────────────────────────────────────

class PurchaseBillService {
  // GET /purchasebill/next-id
  // Returns the doc_id that will be assigned to the next bill (global FY sequence).
  // Does NOT create anything — purely a preview.
  static async getNextDocId() {
    const now     = new Date();
    const month   = now.getMonth() + 1;
    const year    = now.getFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    const fy      = `${fyStart.toString().slice(-2)}-${(fyStart + 1).toString().slice(-2)}`;

    const prefix  = `PB/${fy}/`;
    const lastDoc = await PurchaseBillModel.findOne(
      { doc_id: { $regex: `^${prefix}` } },
      { doc_id: 1 }
    ).sort({ createdAt: -1 });

    const lastSeq  = lastDoc ? parseInt(lastDoc.doc_id.split("/").pop(), 10) : 0;
    const doc_id   = `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
    const is_first = lastDoc === null;

    return { doc_id, is_first };
  }

  static async createPurchaseBill(payload) {
    if (!payload.doc_id) throw new Error("doc_id is required");

    if (payload.invoice_no) {
      const duplicate = await PurchaseBillModel.exists({ invoice_no: payload.invoice_no });
      if (duplicate) throw new Error(`Invoice number '${payload.invoice_no}' already exists`);
    }

    // create() triggers the pre-save hook which computes all derived fields
    const saved = await PurchaseBillModel.create(buildDoc(payload, payload.doc_id));

    // Mark every linked GRN transaction as billed
    await markGRNsBilled(saved.grn_rows, saved.doc_id);

    return saved;
  }
}

export default PurchaseBillService;
