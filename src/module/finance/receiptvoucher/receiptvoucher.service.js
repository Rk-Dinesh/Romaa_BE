import ReceiptVoucherModel from "./receiptvoucher.model.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import ContractorModel from "../../hr/contractors/contractor.model.js";
import LedgerService from "../ledger/ledger.service.js";
import AccountTreeService from "../accounttree/accounttree.service.js";

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
  if (!entries || entries.length === 0) return; // entries are optional
  const totalDr = entries.reduce((s, e) => s + (Number(e.debit_amt)  || 0), 0);
  const totalCr = entries.reduce((s, e) => s + (Number(e.credit_amt) || 0), 0);
  if (Math.round((totalDr - totalCr) * 100) !== 0) {
    throw new Error(
      `Entry lines do not balance: total debits (${totalDr.toFixed(2)}) ≠ total credits (${totalCr.toFixed(2)})`
    );
  }
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
function buildDoc(payload, rv_no) {
  return {
    rv_no,
    rv_date:       payload.rv_date       ? new Date(payload.rv_date) : new Date(),
    document_year: payload.document_year || currentFY(),

    receipt_mode:      payload.receipt_mode      || "NEFT",
    bank_account_code: payload.bank_account_code || "",
    bank_name:         payload.bank_name         || "",
    bank_ref:          payload.bank_ref          || "",
    cheque_no:    payload.cheque_no    || "",
    cheque_date:  payload.cheque_date  ? new Date(payload.cheque_date) : null,

    supplier_type:  payload.supplier_type,
    supplier_id:    payload.supplier_id,
    supplier_ref:   payload.supplier_ref   || null,
    supplier_name:  payload.supplier_name  || "",
    supplier_gstin: payload.supplier_gstin || "",

    tender_id:   payload.tender_id   || "",
    tender_ref:  payload.tender_ref  || null,
    tender_name: payload.tender_name || "",

    against_ref: payload.against_ref || null,
    against_no:  payload.against_no  || "",

    amount: Number(payload.amount) || 0,

    entries: (payload.entries || []).map((e) => ({
      dr_cr:        e.dr_cr,
      account_name: e.account_name || "",
      debit_amt:    Number(e.debit_amt)  || 0,
      credit_amt:   Number(e.credit_amt) || 0,
    })),

    narration: payload.narration || "",
    status:    payload.status    || "pending",
  };
}

// ── Ledger post helper ────────────────────────────────────────────────────────
async function postToLedger(rv) {
  await LedgerService.postEntry({
    supplier_type: rv.supplier_type,
    supplier_id:   rv.supplier_id,
    supplier_ref:  rv.supplier_ref,
    supplier_name: rv.supplier_name,
    vch_date:      rv.rv_date,
    vch_no:        rv.rv_no,
    vch_type:      "Receipt",
    vch_ref:       rv._id,
    cheque_no:     rv.cheque_no  || "",
    cheque_date:   rv.cheque_date || null,
    particulars:   `Receipt Voucher ${rv.rv_no}${rv.narration ? " - " + rv.narration : ""}`,
    tender_id:     rv.tender_id,
    tender_ref:    rv.tender_ref,
    tender_name:   rv.tender_name,
    debit_amt:     rv.amount,  // RV = Dr entry (reduces supplier balance — advance refund / return)
    credit_amt:    0,
  });
}

// ── Service ───────────────────────────────────────────────────────────────────

class ReceiptVoucherService {

  // GET /receiptvoucher/next-no
  static async getNextRvNo() {
    const fy     = currentFY();
    const prefix = `RV/${fy}/`;
    const last   = await ReceiptVoucherModel.findOne(
      { rv_no: { $regex: `^${prefix}` } },
      { rv_no: 1 }
    ).sort({ createdAt: -1 });

    const seq   = last ? parseInt(last.rv_no.split("/").pop(), 10) : 0;
    const rv_no = `${prefix}${String(seq + 1).padStart(4, "0")}`;
    return { rv_no, is_first: !last };
  }

  // GET /receiptvoucher/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.status)        query.status        = filters.status;
    if (filters.receipt_mode)  query.receipt_mode  = filters.receipt_mode;
    if (filters.rv_no)         query.rv_no         = filters.rv_no;

    if (filters.from_date || filters.to_date) {
      query.rv_date = {};
      if (filters.from_date) query.rv_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.rv_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      ReceiptVoucherModel.find(query).sort({ rv_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      ReceiptVoucherModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /receiptvoucher/by-supplier/:supplierId
  static async getBySupplier(supplierId, filters = {}) {
    const query = { supplier_id: supplierId };
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.status)        query.status        = filters.status;
    if (filters.from_date || filters.to_date) {
      query.rv_date = {};
      if (filters.from_date) query.rv_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.rv_date.$lte = to;
      }
    }
    return await ReceiptVoucherModel.find(query).sort({ rv_date: -1 }).lean();
  }

  // GET /receiptvoucher/by-tender/:tenderId
  static async getByTender(tenderId, filters = {}) {
    const query = { tender_id: tenderId };
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.status)        query.status        = filters.status;
    return await ReceiptVoucherModel.find(query).sort({ rv_date: -1 }).lean();
  }

  // GET /receiptvoucher/:id
  static async getById(id) {
    const doc = await ReceiptVoucherModel.findById(id).lean();
    if (!doc) throw new Error("Receipt voucher not found");
    return doc;
  }

  // POST /receiptvoucher/create
  static async create(payload) {
    if (!payload.rv_no)         throw new Error("rv_no is required");
    if (!payload.supplier_id)   throw new Error("supplier_id is required");
    if (!payload.supplier_type) throw new Error("supplier_type is required");

    const supplierData = await resolveSupplier(payload.supplier_type, payload.supplier_id);
    Object.assign(payload, supplierData);

    validateEntriesBalance(payload.entries);

    const saved = await ReceiptVoucherModel.create(buildDoc(payload, payload.rv_no));

    if (saved.status === "approved") {
      await postToLedger(saved);
    }

    return saved;
  }

  // PATCH /receiptvoucher/update/:id
  static async update(id, payload) {
    const rv = await ReceiptVoucherModel.findById(id);
    if (!rv) throw new Error("Receipt voucher not found");
    if (rv.status === "approved") throw new Error("Cannot edit an approved receipt voucher");

    const allowed = [
      "rv_date", "document_year", "receipt_mode", "bank_account_code", "bank_name", "bank_ref",
      "cheque_no", "cheque_date", "against_ref", "against_no", "amount",
      "entries", "narration", "tender_id", "tender_ref", "tender_name",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) rv[field] = payload[field];
    }
    await rv.save();
    return rv;
  }

  // DELETE /receiptvoucher/delete/:id
  static async deleteDraft(id) {
    const rv = await ReceiptVoucherModel.findById(id);
    if (!rv) throw new Error("Receipt voucher not found");
    if (rv.status === "approved") throw new Error("Cannot delete an approved receipt voucher");
    await rv.deleteOne();
    return { deleted: true, rv_no: rv.rv_no };
  }

  // PATCH /receiptvoucher/approve/:id
  static async approve(id) {
    const rv = await ReceiptVoucherModel.findById(id);
    if (!rv)                      throw new Error("Receipt voucher not found");
    if (rv.status === "approved") throw new Error("Already approved");

    rv.status = "approved";
    await rv.save();

    await postToLedger(rv);

    // Increase the receiving bank account's opening_balance in AccountTree
    // Receipt in = Dr to bank account (Dr normal Asset → balance increases)
    if (!rv.bank_account_code) {
      throw new Error("bank_account_code is required to approve a receipt voucher — select the bank account being credited");
    }
    await AccountTreeService.applyBalanceLines([{
      account_code: rv.bank_account_code,
      debit_amt:    rv.amount,
      credit_amt:   0,
    }]);

    return rv;
  }
}

export default ReceiptVoucherService;
