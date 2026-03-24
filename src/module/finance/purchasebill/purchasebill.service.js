import PurchaseBillModel from "./purchasebill.model.js";
import MaterialTransactionModel from "../../tender/materials/materialTransaction.model.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import LedgerService from "../ledger/ledger.service.js";

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

    // Only pass source fields — pre-save derives cgst_amt, sgst_amt, igst_amt, net_amt
    line_items: (payload.line_items || []).map((i) => ({
      grn_no:           i.grn_no            || "",
      grn_ref:          i.grn_ref           || null,
      ref_date:         i.ref_date ? new Date(i.ref_date) : null,
      item_id:          i.item_id           || null,
      item_description: i.item_description  || "",
      unit:             i.unit              || "",
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

// ── Post to supplier ledger on approval ──────────────────────────────────────
// PurchaseBill = Cr entry (liability created — you owe the vendor)
async function postToLedger(bill) {
  await LedgerService.postEntry({
    supplier_type: "Vendor",
    supplier_id:   bill.vendor_id,
    supplier_ref:  bill.vendor_ref,
    supplier_name: bill.vendor_name,
    vch_date:      bill.doc_date,
    vch_no:        bill.doc_id,
    vch_type:      "PurchaseBill",
    vch_ref:       bill._id,
    particulars:   `Purchase Bill ${bill.doc_id}${bill.narration ? " - " + bill.narration : ""}`,
    tender_id:     bill.tender_id,
    tender_ref:    bill.tender_ref,
    tender_name:   bill.tender_name,
    debit_amt:     0,
    credit_amt:    bill.net_amount,  // Cr entry: payable to vendor
  });
}

// ── Mark linked GRN transactions as billed ────────────────────────────────────

async function markGRNsBilled(line_items, doc_id) {
  if (!line_items || line_items.length === 0) return;

  const refs  = line_items.map((r) => r.grn_ref).filter(Boolean);
  const names = line_items.map((r) => r.grn_no).filter(Boolean);
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

  // GET /purchasebill/list
  // All filters are optional and combinable.
  // Returns summary fields only — line_items / tax_groups excluded.
  static async getBills(filters = {}) {
    const query = {};

    if (filters.doc_id)    query.doc_id    = filters.doc_id;
    if (filters.tender_id) query.tender_id = filters.tender_id;
    if (filters.vendor_id) query.vendor_id = filters.vendor_id;
    if (filters.tax_mode)  query.tax_mode  = filters.tax_mode;
    if (filters.invoice_no) query.invoice_no = { $regex: filters.invoice_no, $options: "i" };
    if (filters.status)    query.status    = filters.status;

    if (filters.from_date || filters.to_date) {
      query.doc_date = {};
      if (filters.from_date) query.doc_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.doc_date.$lte = to;
      }
    }

    return await PurchaseBillModel.find(query)
      .select(
        "doc_id doc_date invoice_no invoice_date due_date credit_days " +
        "tender_id tender_name " +
        "vendor_id vendor_name vendor_gstin " +
        "place_of_supply tax_mode status " +
        "grand_total total_tax net_amount round_off " +
        "createdAt"
      )
      .sort({ doc_date: -1, createdAt: -1 })
      .lean();
  }

  // GET /purchasebill/by-tender/:tenderId?status=&vendor_id=&from_date=&to_date=&invoice_no=
  // All bills for a tender with full details — no pagination.
  static async getBillsByTender(tenderId, filters = {}) {
    const query = { tender_id: tenderId };

    if (filters.status)     query.status     = filters.status;
    if (filters.vendor_id)  query.vendor_id  = filters.vendor_id;
    if (filters.tax_mode)   query.tax_mode   = filters.tax_mode;
    if (filters.invoice_no) query.invoice_no = { $regex: filters.invoice_no, $options: "i" };

    if (filters.from_date || filters.to_date) {
      query.doc_date = {};
      if (filters.from_date) query.doc_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.doc_date.$lte = to;
      }
    }

    return await PurchaseBillModel.find(query)
      .sort({ doc_date: -1, createdAt: -1 })
      .lean();
  }

  // GET /purchasebill/summary/:tenderId
  // Aggregate totals + status breakdown for a single tender.
  static async getTenderSummary(tenderId) {
    const [agg] = await PurchaseBillModel.aggregate([
      { $match: { tender_id: tenderId } },
      {
        $facet: {
          totals: [
            { $match: { status: { $ne: "draft" } } },
            {
              $group: {
                _id:         null,
                total_bills: { $sum: 1 },
                total_grand: { $sum: "$grand_total" },
                total_tax:   { $sum: "$total_tax" },
                total_net:   { $sum: "$net_amount" },
              },
            },
          ],
          by_status: [
            { $group: { _id: "$status", count: { $sum: 1 }, net_amount: { $sum: "$net_amount" } } },
            { $sort: { _id: 1 } },
          ],
          recent: [
            { $sort: { doc_date: -1, createdAt: -1 } },
            { $limit: 5 },
            { $project: { doc_id: 1, doc_date: 1, invoice_no: 1, vendor_name: 1, net_amount: 1, status: 1, due_date: 1 } },
          ],
        },
      },
    ]);

    const totals = agg.totals[0] || { total_bills: 0, total_grand: 0, total_tax: 0, total_net: 0 };

    return {
      tender_id:   tenderId,
      total_bills: totals.total_bills,
      total_grand: totals.total_grand,
      total_tax:   totals.total_tax,
      total_net:   totals.total_net,
      by_status:   agg.by_status,
      recent:      agg.recent,
    };
  }

  // GET /purchasebill/summary-all
  // One summary row per tender — for the finance overview table.
  // Each row: tender_id, tender_name, total_bills, total_grand, total_tax,
  //           total_net, pending_amount, paid_amount, latest_bill_date
  static async getAllTendersSummary() {
    return await PurchaseBillModel.aggregate([
      // Only non-draft bills contribute to financials
      {
        $group: {
          _id:               "$tender_id",
          tender_name:       { $first: "$tender_name" },
          total_bills:       { $sum: 1 },
          total_grand:       { $sum: "$grand_total" },
          total_tax:         { $sum: "$total_tax" },
          total_net:         { $sum: "$net_amount" },
          pending_amount: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$net_amount", 0] },
          },
          approved_amount: {
            $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$net_amount", 0] },
          },
          paid_amount: {
            $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$net_amount", 0] },
          },
          latest_bill_date:  { $max: "$doc_date" },
        },
      },
      {
        $project: {
          _id:              0,
          tender_id:        "$_id",
          tender_name:      1,
          total_bills:      1,
          total_grand:      1,
          total_tax:        1,
          total_net:        1,
          pending_amount:   1,
          approved_amount:  1,
          paid_amount:      1,
          latest_bill_date: 1,
        },
      },
      { $sort: { latest_bill_date: -1 } },
    ]);
  }

  static async createPurchaseBill(payload) {
    if (!payload.doc_id) throw new Error("doc_id is required");
    if (!payload.vendor_id) throw new Error("vendor_id is required");

    if (payload.invoice_no) {
      const duplicate = await PurchaseBillModel.exists({ invoice_no: payload.invoice_no });
      if (duplicate) throw new Error(`Invoice number '${payload.invoice_no}' already exists`);
    }

    // Auto-fill vendor fields from VendorModel
    const vendor = await VendorModel.findOne({ vendor_id: payload.vendor_id }).lean();
    if (!vendor) throw new Error(`Vendor '${payload.vendor_id}' not found`);

    payload.vendor_ref      = vendor._id;
    payload.vendor_name     = vendor.company_name;
    payload.vendor_gstin    = vendor.gstin    || "";
    payload.place_of_supply = vendor.place_of_supply || "InState";
    // Auto-fill credit_days from vendor master if not explicitly provided
    if (!payload.credit_days) payload.credit_days = vendor.credit_day || 0;

    // create() triggers the pre-save hook which computes all derived fields
    const saved = await PurchaseBillModel.create(buildDoc(payload, payload.doc_id));

    // Mark every linked GRN transaction as billed
    await markGRNsBilled(saved.line_items, saved.doc_id);

    // Auto-post to ledger if created directly as approved
    if (saved.status === "approved") {
      await postToLedger(saved);
    }

    return saved;
  }

  // PATCH /purchasebill/approve/:id
  static async approvePurchaseBill(id) {
    const bill = await PurchaseBillModel.findById(id);
    if (!bill)                        throw new Error("Purchase bill not found");
    if (bill.status === "approved")   throw new Error("Already approved");

    bill.status = "approved";
    await bill.save();

    await postToLedger(bill);

    return bill;
  }
}

export default PurchaseBillService;
