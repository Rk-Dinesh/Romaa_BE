import CreditNoteModel from "./creditnote.model.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import ContractorModel from "../../hr/contractors/contractor.model.js";
import PurchaseBillModel from "../purchasebill/purchasebill.model.js";
import WeeklyBillingModel from "../weeklyBilling/WeeklyBilling.model.js";
import LedgerService from "../ledger/ledger.service.js";
import AccountTreeService from "../accounttree/accounttree.service.js";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── FY helper ─────────────────────────────────────────────────────────────────
function currentFY() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`; // "25-26"
}

// Validate that entries balance: sum of debits must equal sum of credits
function validateEntriesBalance(entries) {
  if (!entries || entries.length === 0) return;
  const totalDr = entries.reduce((s, e) => s + (Number(e.debit_amt)  || 0), 0);
  const totalCr = entries.reduce((s, e) => s + (Number(e.credit_amt) || 0), 0);
  if (Math.round((totalDr - totalCr) * 100) !== 0) {
    throw new Error(
      `Entry lines do not balance: total debits (${totalDr.toFixed(2)}) ≠ total credits (${totalCr.toFixed(2)})`
    );
  }
}

// ── Resolve bill ObjectId from bill_no string ─────────────────────────────────
async function resolveBillRef(bill_no, supplier_type) {
  if (!bill_no) return null;
  if (supplier_type === "Vendor") {
    const bill = await PurchaseBillModel.findOne({ doc_id: bill_no }, { _id: 1 }).lean();
    return bill ? bill._id : null;
  }
  if (supplier_type === "Contractor") {
    const bill = await WeeklyBillingModel.findOne({ bill_no }, { _id: 1 }).lean();
    return bill ? bill._id : null;
  }
  return null;
}

// ── Split gst_percent into CGST/SGST/IGST based on sales_type ────────────────
function resolveGstRates(payload) {
  let cgst_pct = Number(payload.cgst_pct) || 0;
  let sgst_pct = Number(payload.sgst_pct) || 0;
  let igst_pct = Number(payload.igst_pct) || 0;

  if (!cgst_pct && !sgst_pct && !igst_pct && payload.gst_percent) {
    const gp = Number(payload.gst_percent);
    if (payload.sales_type === "Interstate") {
      igst_pct = gp;
    } else {
      cgst_pct = gp / 2;
      sgst_pct = gp / 2;
    }
  }

  return { cgst_pct, sgst_pct, igst_pct };
}

// ── Auto-fill supplier fields ─────────────────────────────────────────────────
async function resolveSupplier(supplier_type, supplier_id) {
  if (supplier_type === "Vendor") {
    const vendor = await VendorModel.findOne({ vendor_id: supplier_id }).lean();
    if (!vendor) throw new Error(`Vendor '${supplier_id}' not found`);
    return {
      supplier_ref:   vendor._id,
      supplier_name:  vendor.company_name,
      supplier_gstin: vendor.gstin || "",
    };
  }

  if (supplier_type === "Contractor") {
    const contractor = await ContractorModel.findOne({ contractor_id: supplier_id }).lean();
    if (!contractor) throw new Error(`Contractor '${supplier_id}' not found`);
    return {
      supplier_ref:   contractor._id,
      supplier_name:  contractor.contractor_name,
      supplier_gstin: contractor.gst_number || "",
    };
  }

  throw new Error(`Invalid supplier_type '${supplier_type}'. Must be Vendor or Contractor`);
}

// ── Build document from payload ───────────────────────────────────────────────
function buildDoc(payload, cn_no) {
  const { cgst_pct, sgst_pct, igst_pct } = resolveGstRates(payload);

  return {
    cn_no,
    cn_date:        payload.cn_date        ? new Date(payload.cn_date)        : new Date(),
    document_year:  payload.document_year  || currentFY(),
    reference_no:   payload.reference_no   || "",
    reference_date: payload.reference_date ? new Date(payload.reference_date) : null,
    location:       payload.location       || "",
    sales_type:     payload.sales_type     || "Local",
    adj_type:       payload.adj_type       || "Against Bill",
    tax_type:       payload.tax_type       || "GST",
    rev_charge:     Boolean(payload.rev_charge),

    supplier_type:  payload.supplier_type,
    supplier_id:    payload.supplier_id,
    supplier_ref:   payload.supplier_ref   || null,
    supplier_name:  payload.supplier_name  || "",
    supplier_gstin: payload.supplier_gstin || "",

    tender_id:   payload.tender_id   || "",
    tender_ref:  payload.tender_ref  || null,
    tender_name: payload.tender_name || "",

    bill_ref: payload.bill_ref || null,
    bill_no:  payload.bill_no  || "",

    amount:         Number(payload.amount)         || 0,
    round_off:      Number(payload.round_off)      || 0,
    taxable_amount: Number(payload.taxable_amount) || Number(payload.amount) || 0,
    cgst_pct,
    sgst_pct,
    igst_pct,

    entries: (payload.entries || []).map((e) => ({
      dr_cr:        e.dr_cr,
      account_code: e.account_code || "",
      account_name: e.account_name || "",
      debit_amt:    Number(e.debit_amt)  || 0,
      credit_amt:   Number(e.credit_amt) || 0,
    })),

    narration: payload.narration || "",
    status:    payload.status    || "pending",
  };
}

// ── Post CN to supplier ledger on approval ────────────────────────────────────
// Single Dr entry for the header amount — reduces supplier payable.
async function postCNToLedger(cn) {
  await LedgerService.postEntry({
    supplier_type: cn.supplier_type,
    supplier_id:   cn.supplier_id,
    supplier_ref:  cn.supplier_ref,
    supplier_name: cn.supplier_name,
    vch_date:      cn.cn_date,
    vch_no:        cn.cn_no,
    vch_type:      "CreditNote",
    vch_ref:       cn._id,
    tender_id:     cn.tender_id,
    tender_ref:    cn.tender_ref,
    tender_name:   cn.tender_name,
    particulars:   `Credit Note ${cn.cn_no}${cn.narration ? " - " + cn.narration : ""}`,
    debit_amt:     cn.amount,
    credit_amt:    0,
  });
}

// ── Update AccountTree balances from entry lines ──────────────────────────────
// Each entry line with an account_code updates that account's available_balance.
async function updateAccountBalances(entries) {
  const lines = (entries || [])
    .filter((e) => e.account_code)
    .map((e) => ({
      account_code: e.account_code,
      debit_amt:    Number(e.debit_amt)  || 0,
      credit_amt:   Number(e.credit_amt) || 0,
    }));
  if (lines.length > 0) {
    await AccountTreeService.applyBalanceLines(lines);
  }
}

// ── Adjust linked bill when CN is "Against Bill" ──────────────────────────────
// Appends an adjustment_refs entry, increments cn_amount, and recomputes paid_status.
async function markBillAdjusted(cn) {
  if (cn.adj_type !== "Against Bill" || !cn.bill_ref) return;

  const Model = cn.supplier_type === "Contractor"
    ? WeeklyBillingModel
    : PurchaseBillModel;

  const bill = await Model.findById(cn.bill_ref);
  if (!bill) return;

  // Append CN adjustment record
  bill.adjustment_refs.push({
    adj_type: "CreditNote",
    adj_ref:  cn._id,
    adj_no:   cn.cn_no,
    adj_amt:  cn.amount,
    adj_date: cn.cn_date || new Date(),
  });

  // Accumulate CN amount
  bill.cn_amount = round2((bill.cn_amount || 0) + cn.amount);

  // Recompute paid_status: consider payments + CN + DN
  const billTotal = cn.supplier_type === "Contractor"
    ? (bill.net_payable || bill.total_amount)
    : bill.net_amount;

  const totalSettled = round2(
    (bill.amount_paid || 0) + (bill.cn_amount || 0) + (bill.dn_amount || 0)
  );

  if (totalSettled >= billTotal) {
    bill.paid_status = "paid";
  } else if (totalSettled > 0) {
    bill.paid_status = "partial";
  } else {
    bill.paid_status = "unpaid";
  }

  await bill.save();
}

// ── Full approval flow ────────────────────────────────────────────────────────
async function approveCN(cn) {
  // 1. Post to supplier sub-ledger (Dr entry — reduces payable)
  await postCNToLedger(cn);

  // 2. If "Against Bill", adjust the linked bill
  await markBillAdjusted(cn);
}

// ── Service ───────────────────────────────────────────────────────────────────

class CreditNoteService {

  // GET /creditnote/next-no
  static async getNextCnNo() {
    const fy     = currentFY();
    const prefix = `CN/${fy}/`;
    const last   = await CreditNoteModel.findOne(
      { cn_no: { $regex: `^${prefix}` } },
      { cn_no: 1 }
    ).sort({ createdAt: -1 });

    const seq   = last ? parseInt(last.cn_no.split("/").pop(), 10) : 0;
    const cn_no = `${prefix}${String(seq + 1).padStart(4, "0")}`;
    return { cn_no, is_first: !last };
  }

  // GET /creditnote/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.status)        query.status        = filters.status;
    if (filters.adj_type)      query.adj_type      = filters.adj_type;
    if (filters.tax_type)      query.tax_type      = filters.tax_type;
    if (filters.cn_no)         query.cn_no         = filters.cn_no;

    if (filters.from_date || filters.to_date) {
      query.cn_date = {};
      if (filters.from_date) query.cn_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.cn_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      CreditNoteModel.find(query).sort({ cn_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      CreditNoteModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /creditnote/by-supplier/:supplierId
  static async getBySupplier(supplierId, filters = {}) {
    const query = { supplier_id: supplierId };
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.status)        query.status        = filters.status;
    if (filters.from_date || filters.to_date) {
      query.cn_date = {};
      if (filters.from_date) query.cn_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.cn_date.$lte = to;
      }
    }
    return await CreditNoteModel.find(query).sort({ cn_date: -1 }).lean();
  }

  // GET /creditnote/by-tender/:tenderId
  static async getByTender(tenderId, filters = {}) {
    const query = { tender_id: tenderId };
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.status)        query.status        = filters.status;
    return await CreditNoteModel.find(query).sort({ cn_date: -1 }).lean();
  }

  // GET /creditnote/:id
  static async getById(id) {
    const doc = await CreditNoteModel.findById(id).lean();
    if (!doc) throw new Error("Credit note not found");
    return doc;
  }

  // POST /creditnote/create
  static async create(payload) {
    if (!payload.cn_no)         throw new Error("cn_no is required");
    if (!payload.supplier_id)   throw new Error("supplier_id is required");
    if (!payload.supplier_type) throw new Error("supplier_type is required");

    // Auto-fill supplier fields from master
    const supplierData = await resolveSupplier(payload.supplier_type, payload.supplier_id);
    Object.assign(payload, supplierData);

    // Resolve bill ObjectId from bill_no if not already provided
    if (payload.bill_no && !payload.bill_ref) {
      payload.bill_ref = await resolveBillRef(payload.bill_no, payload.supplier_type);
    }

    validateEntriesBalance(payload.entries);

    const saved = await CreditNoteModel.create(buildDoc(payload, payload.cn_no));

    // Full approval flow if created directly as approved
    if (saved.status === "approved") {
      await approveCN(saved);
    }

    return saved;
  }

  // PATCH /creditnote/update/:id
  static async update(id, payload) {
    const cn = await CreditNoteModel.findById(id);
    if (!cn) throw new Error("Credit note not found");
    if (cn.status === "approved") throw new Error("Cannot edit an approved credit note");

    const allowed = [
      "cn_date", "document_year", "reference_no", "reference_date", "location",
      "sales_type", "adj_type", "tax_type", "rev_charge", "bill_ref", "bill_no",
      "amount", "entries", "narration", "tender_id", "tender_ref", "tender_name",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) cn[field] = payload[field];
    }
    await cn.save();
    return cn;
  }

  // DELETE /creditnote/delete/:id
  static async deleteDraft(id) {
    const cn = await CreditNoteModel.findById(id);
    if (!cn) throw new Error("Credit note not found");
    if (cn.status === "approved") throw new Error("Cannot delete an approved credit note");
    await cn.deleteOne();
    return { deleted: true, cn_no: cn.cn_no };
  }

  // PATCH /creditnote/approve/:id
  static async approve(id) {
    const cn = await CreditNoteModel.findById(id);
    if (!cn)                        throw new Error("Credit note not found");
    if (cn.status === "approved")   throw new Error("Already approved");

    cn.status = "approved";
    await cn.save();

    // Full approval flow: supplier ledger + GL + bill adjustment
    await approveCN(cn);

    return cn;
  }
}

export default CreditNoteService;
