import PurchaseBillModel from "./purchasebill.model.js";
import MaterialTransactionModel from "../../tender/materials/materialTransaction.model.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import LedgerService from "../ledger/ledger.service.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import FinanceCounterModel from "../FinanceCounter.model.js";

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
      grn_no:           i.grn_no   || i.grn_bill_no || "",   // grn_bill_no = field name from getGRNForBilling API
      grn_ref:          i.grn_ref  || i._id          || null, // _id = field name from getGRNForBilling API
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

// ── Build GRN filter from line items ─────────────────────────────────────────
function buildGRNFilter(line_items) {
  if (!line_items || line_items.length === 0) return null;
  const refs  = line_items.map((r) => r.grn_ref).filter(Boolean);
  const names = line_items.map((r) => r.grn_no).filter(Boolean);
  if (refs.length === 0 && names.length === 0) return null;

  const filter = { type: "IN" };
  if (refs.length && names.length) {
    filter.$or = [{ _id: { $in: refs } }, { grn_bill_no: { $in: names } }];
  } else if (refs.length) {
    filter._id = { $in: refs };
  } else {
    filter.grn_bill_no = { $in: names };
  }
  return filter;
}

// ── Mark linked GRN transactions as billed (called on approval) ──────────────
async function markGRNsBilled(bill) {
  const { line_items, doc_id, tender_id, vendor_id } = bill;

  // Primary path: use stored grn_ref (ObjectId) / grn_bill_no (string)
  const filter = buildGRNFilter(line_items);
  if (filter) {
    await MaterialTransactionModel.updateMany(
      filter,
      { $set: { is_bill_generated: true, purchase_bill_id: doc_id } }
    );
    return;
  }

  // Fallback: grn refs were not stored (legacy data) — match by tender + vendor + item_ids
  const itemIds = (line_items || []).map((r) => r.item_id).filter(Boolean);
  if (!tender_id || !vendor_id || itemIds.length === 0) return;

  await MaterialTransactionModel.updateMany(
    { tender_id, vendor_id, type: "IN", is_bill_generated: false, item_id: { $in: itemIds } },
    { $set: { is_bill_generated: true, purchase_bill_id: doc_id } }
  );
}

// ── Unmark linked GRN transactions (called on delete of pending bill) ─────────
async function unmarkGRNsBilled(line_items) {
  const filter = buildGRNFilter(line_items);
  if (!filter) return;
  await MaterialTransactionModel.updateMany(
    filter,
    { $set: { is_bill_generated: false, purchase_bill_id: "" } }
  );
}

// ── Service ───────────────────────────────────────────────────────────────────

class PurchaseBillService {
  // GET /purchasebill/next-id
  // Returns the doc_id that will be assigned to the next bill (global FY sequence).
  // Does NOT create anything — purely a preview (reads counter without incrementing).
  static async getNextDocId() {
    const now     = new Date();
    const month   = now.getMonth() + 1;
    const year    = now.getFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    const fy      = `${fyStart.toString().slice(-2)}-${(fyStart + 1).toString().slice(-2)}`;

    const counter  = await FinanceCounterModel.findById(`PB/${fy}`).lean();
    const nextSeq  = counter ? counter.seq + 1 : 1;
    const doc_id   = `PB/${fy}/${String(nextSeq).padStart(4, "0")}`;
    return { doc_id, is_first: !counter };
  }

  // Internal: atomically allocate the next PB sequence number.
  static async #allocateDocId() {
    const now     = new Date();
    const month   = now.getMonth() + 1;
    const year    = now.getFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    const fy      = `${fyStart.toString().slice(-2)}-${(fyStart + 1).toString().slice(-2)}`;

    const counter = await FinanceCounterModel.findByIdAndUpdate(
      `PB/${fy}`,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return `PB/${fy}/${String(counter.seq).padStart(4, "0")}`;
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

    if (filters.search) {
      const s = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { doc_id:      { $regex: s, $options: "i" } },
        { vendor_name: { $regex: s, $options: "i" } },
        { tender_name: { $regex: s, $options: "i" } },
        { invoice_no:  { $regex: s, $options: "i" } },
      ];
    }

    if (filters.from_date || filters.to_date) {
      query.doc_date = {};
      if (filters.from_date) query.doc_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.doc_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      PurchaseBillModel.find(query)
        .select(
          "doc_id doc_date invoice_no invoice_date due_date credit_days " +
          "tender_id tender_name " +
          "vendor_id vendor_name vendor_gstin " +
          "place_of_supply tax_mode status " +
          "grand_total total_tax net_amount round_off " +
          "createdAt"
        )
        .sort({ doc_date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PurchaseBillModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /purchasebill/by-tender/:tenderId?status=&vendor_id=&from_date=&to_date=&invoice_no=
  // All bills for a tender with full details.
  static async getBillsByTender(tenderId, filters = {}) {
    const query = { tender_id: tenderId };

    if (filters.status)     query.status     = filters.status;
    if (filters.vendor_id)  query.vendor_id  = filters.vendor_id;
    if (filters.tax_mode)   query.tax_mode   = filters.tax_mode;
    if (filters.invoice_no) query.invoice_no = { $regex: filters.invoice_no, $options: "i" };

    if (filters.search) {
      const s = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { doc_id:      { $regex: s, $options: "i" } },
        { vendor_name: { $regex: s, $options: "i" } },
        { invoice_no:  { $regex: s, $options: "i" } },
      ];
    }

    if (filters.from_date || filters.to_date) {
      query.doc_date = {};
      if (filters.from_date) query.doc_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.doc_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      PurchaseBillModel.find(query).sort({ doc_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      PurchaseBillModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
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
      { $match: { status: { $ne: "draft" } } },
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
          latest_bill_date: 1,
        },
      },
      { $sort: { latest_bill_date: -1 } },
    ]);
  }

  // GET /purchasebill/:id
  static async getPurchaseBillById(id) {
    const bill = await PurchaseBillModel.findById(id).lean();
    if (!bill) throw new Error("Purchase bill record not found. Please verify the bill ID and try again");
    return bill;
  }

  // PATCH /purchasebill/update/:id
  static async updatePurchaseBill(id, payload) {
    const bill = await PurchaseBillModel.findById(id);
    if (!bill) throw new Error("Purchase bill record not found. Please verify the bill ID and try again");
    if (bill.status === "approved") throw new Error("Cannot edit an approved purchase bill. Approved bills are locked for audit integrity");

    const allowed = ["doc_date", "invoice_no", "invoice_date", "credit_days", "narration", "line_items", "additional_charges", "place_of_supply"];
    for (const field of allowed) {
      if (payload[field] !== undefined) bill[field] = payload[field];
    }
    // Always derive tax_mode from place_of_supply — never accept it from the client directly
    bill.tax_mode = bill.place_of_supply === "InState" ? "instate" : "otherstate";

    await bill.save(); // triggers pre-save hook — recomputes all tax/total fields
    return bill;
  }

  // DELETE /purchasebill/delete/:id
  static async deletePurchaseBill(id) {
    const bill = await PurchaseBillModel.findById(id);
    if (!bill) throw new Error("Purchase bill not found");
    if (bill.status === "approved") throw new Error("Cannot delete an approved purchase bill");
    // Release GRN locks so they can be picked by a new bill
    await unmarkGRNsBilled(bill.line_items);
    await bill.deleteOne();
    return { deleted: true, doc_id: bill.doc_id };
  }

  static async createPurchaseBill(payload) {
    if (!payload.vendor_id) throw new Error("vendor_id is required");

    if (payload.invoice_no) {
      const duplicate = await PurchaseBillModel.exists({ vendor_id: payload.vendor_id, invoice_no: payload.invoice_no });
      if (duplicate) throw new Error(`Invoice number '${payload.invoice_no}' already exists for this vendor`);
    }

    // Auto-fill vendor fields from VendorModel
    const vendor = await VendorModel.findOne({ vendor_id: payload.vendor_id }).lean();
    if (!vendor) throw new Error(`Vendor '${payload.vendor_id}' not found`);

    payload.vendor_ref      = vendor._id;
    payload.vendor_name     = vendor.company_name;
    payload.vendor_gstin    = vendor.gstin    || "";
    payload.place_of_supply = vendor.place_of_supply || "InState";
    payload.tax_mode        = payload.place_of_supply === "InState" ? "instate" : "otherstate";
    // Auto-fill credit_days from vendor master if not explicitly provided
    if (!payload.credit_days) payload.credit_days = vendor.credit_day || 0;

    // Atomically allocate doc_id (ignore any client-supplied doc_id to prevent duplicates)
    const doc_id = await PurchaseBillService.#allocateDocId();

    // create() triggers the pre-save hook which computes all derived fields
    const saved = await PurchaseBillModel.create(buildDoc(payload, doc_id));

    // Auto-approve flow if created directly as approved
    if (saved.status === "approved") {
      await postToLedger(saved);
      await markGRNsBilled(saved);
      await PurchaseBillService.#postJE(saved);
    }

    return saved;
  }

  // ── Build and post the double-entry JE for a purchase bill ───────────────────
  static async #postJE(bill) {
    const vendorAccCode = await JournalEntryService.getSupplierAccountCode("Vendor", bill.vendor_id);

    const jeLines = [
      // Dr: Material / subcontract expense
      { account_code: "5010", dr_cr: "Dr", debit_amt: bill.grand_total, credit_amt: 0, narration: "Material cost" },
    ];

    // Dr: GST Input ITC (split by component based on tax_mode)
    if (bill.tax_mode === "instate") {
      const cgstTotal = bill.tax_groups.reduce((s, g) => s + (g.cgst_amt || 0), 0);
      const sgstTotal = bill.tax_groups.reduce((s, g) => s + (g.sgst_amt || 0), 0);
      if (cgstTotal > 0) jeLines.push({ account_code: "1080-CGST", dr_cr: "Dr", debit_amt: cgstTotal, credit_amt: 0, narration: "CGST Input ITC" });
      if (sgstTotal > 0) jeLines.push({ account_code: "1080-SGST", dr_cr: "Dr", debit_amt: sgstTotal, credit_amt: 0, narration: "SGST Input ITC" });
    } else {
      const igstTotal = bill.tax_groups.reduce((s, g) => s + (g.igst_amt || 0), 0);
      if (igstTotal > 0) jeLines.push({ account_code: "1080-IGST", dr_cr: "Dr", debit_amt: igstTotal, credit_amt: 0, narration: "IGST Input ITC" });
    }

    // Handle additional charges / deductions + round-off (keeps JE balanced)
    const slop = Math.round((bill.net_amount - bill.grand_total - bill.total_tax) * 100) / 100;
    if (slop > 0) jeLines.push({ account_code: "5160", dr_cr: "Dr", debit_amt: slop, credit_amt: 0, narration: "Additional charges / round-off" });
    if (slop < 0) jeLines.push({ account_code: "4050", dr_cr: "Cr", debit_amt: 0, credit_amt: Math.abs(slop), narration: "Deductions / round-off" });

    // Cr: Vendor payable (personal ledger account)
    if (vendorAccCode) {
      jeLines.push({ account_code: vendorAccCode, dr_cr: "Cr", debit_amt: 0, credit_amt: bill.net_amount, narration: "Payable to vendor" });
    }

    const je = await JournalEntryService.createFromVoucher(jeLines, {
      je_type:     "Purchase Invoice",
      je_date:     bill.doc_date || new Date(),
      narration:   `Purchase Bill ${bill.doc_id} — ${bill.vendor_name}${bill.narration ? " | " + bill.narration : ""}`,
      tender_id:   bill.tender_id,
      tender_name: bill.tender_name || "",
      source_ref:  bill._id,
      source_type:             "PurchaseBill",
      source_no:               bill.doc_id,
      skip_ledger_cross_post:  true,  // postToLedger() already posted to supplier ledger
    });

    if (je?._id) {
      await PurchaseBillModel.findByIdAndUpdate(bill._id, { je_ref: je._id, je_no: je.je_no });
    }
  }

  // PATCH /purchasebill/approve/:id
  static async approvePurchaseBill(id) {
    const bill = await PurchaseBillModel.findById(id);
    if (!bill)                        throw new Error("Purchase bill not found");
    if (bill.status === "approved")   throw new Error("Already approved");

    bill.status = "approved";
    await bill.save();

    // 1. Post Cr entry to vendor sub-ledger (liability created — payable to vendor)
    await postToLedger(bill);

    // 2. Lock all linked GRNs — mark them as billed so they can't be picked again
    await markGRNsBilled(bill);

    // 3. Post double-entry JE to general ledger (Dr expense + GST ITC / Cr vendor payable)
    await PurchaseBillService.#postJE(bill);

    return bill;
  }
}

export default PurchaseBillService;
