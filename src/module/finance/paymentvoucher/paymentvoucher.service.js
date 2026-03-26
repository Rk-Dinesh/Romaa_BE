import PaymentVoucherModel from "./paymentvoucher.model.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import ContractorModel from "../../hr/contractors/contractor.model.js";
import LedgerService from "../ledger/ledger.service.js";
import PurchaseBillModel from "../purchasebill/purchasebill.model.js";
import WeeklyBillingModel from "../weeklyBilling/WeeklyBilling.model.js";
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
function buildDoc(payload, pv_no) {
  return {
    pv_no,
    pv_date:       payload.pv_date       ? new Date(payload.pv_date) : new Date(),
    document_year: payload.document_year || currentFY(),

    payment_mode:      payload.payment_mode      || "NEFT",
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

    bill_refs: (payload.bill_refs || []).map((b) => ({
      bill_type:   b.bill_type   || "PurchaseBill",
      bill_ref:    b.bill_ref    || null,
      bill_no:     b.bill_no     || "",
      settled_amt: Number(b.settled_amt) || 0,
    })),

    amount: Number(payload.amount) || 0,
    gross_amount: Number(payload.gross_amount) || Number(payload.amount) || 0,
    tds_section:  payload.tds_section || "",
    tds_pct:      Number(payload.tds_pct) || 0,

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
async function postToLedger(pv) {
  await LedgerService.postEntry({
    supplier_type: pv.supplier_type,
    supplier_id:   pv.supplier_id,
    supplier_ref:  pv.supplier_ref,
    supplier_name: pv.supplier_name,
    vch_date:      pv.pv_date,
    vch_no:        pv.pv_no,
    vch_type:      "Payment",
    vch_ref:       pv._id,
    cheque_no:     pv.cheque_no  || "",
    cheque_date:   pv.cheque_date || null,
    particulars:   `Payment Voucher ${pv.pv_no}${pv.narration ? " - " + pv.narration : ""}`,
    tender_id:     pv.tender_id,
    tender_ref:    pv.tender_ref,
    tender_name:   pv.tender_name,
    debit_amt:     pv.amount,  // PV = Dr entry (clears/reduces supplier payable)
    credit_amt:    0,
  });
}

// ── Mark referenced bills as (partially) paid ─────────────────────────────────
// Called after a PV is approved. Iterates bill_refs and for each:
//   1. Pushes a payment_refs entry onto the bill
//   2. Increments amount_paid
//   3. Recomputes paid_status (unpaid / partial / paid)
//
// Uses findById + save (not findOneAndUpdate) so the payment_refs array push
// goes through Mongoose array mutation — safe for concurrent saves because
// each PV only touches its own bill_refs set.
async function markBillsSettled(pv) {
  if (!pv.bill_refs || pv.bill_refs.length === 0) return;

  for (const ref of pv.bill_refs) {
    if (!ref.bill_ref || !(ref.settled_amt > 0)) continue;

    const Model = ref.bill_type === "WeeklyBilling"
      ? WeeklyBillingModel
      : PurchaseBillModel;

    const bill = await Model.findById(ref.bill_ref);
    if (!bill) continue;

    // Append the new payment record
    bill.payment_refs.push({
      pv_ref:    pv._id,
      pv_no:     pv.pv_no,
      paid_amt:  ref.settled_amt,
      paid_date: pv.pv_date || new Date(),
    });

    // Accumulate paid amount
    bill.amount_paid = Math.round(((bill.amount_paid || 0) + ref.settled_amt) * 100) / 100;

    // Recalculate paid_status against the bill's payable total
    const billTotal = ref.bill_type === "WeeklyBilling"
      ? (bill.net_payable || bill.total_amount)
      : bill.net_amount;

    if (bill.amount_paid >= billTotal) {
      bill.paid_status = "paid";
    } else {
      bill.paid_status = "partial";
    }

    await bill.save();
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

class PaymentVoucherService {

  // GET /paymentvoucher/next-no
  static async getNextPvNo() {
    const fy     = currentFY();
    const prefix = `PV/${fy}/`;
    const last   = await PaymentVoucherModel.findOne(
      { pv_no: { $regex: `^${prefix}` } },
      { pv_no: 1 }
    ).sort({ createdAt: -1 });

    const seq   = last ? parseInt(last.pv_no.split("/").pop(), 10) : 0;
    const pv_no = `${prefix}${String(seq + 1).padStart(4, "0")}`;
    return { pv_no, is_first: !last };
  }

  // GET /paymentvoucher/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.status)        query.status        = filters.status;
    if (filters.payment_mode) {
      // "bank" is a virtual keyword → match all non-cash modes
      if (filters.payment_mode === "bank") {
        query.payment_mode = { $in: ["Cheque", "NEFT", "RTGS", "UPI", "DD"] };
      } else {
        query.payment_mode = filters.payment_mode;
      }
    }
    if (filters.pv_no)         query.pv_no         = filters.pv_no;

    if (filters.from_date || filters.to_date) {
      query.pv_date = {};
      if (filters.from_date) query.pv_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.pv_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      PaymentVoucherModel.find(query).sort({ pv_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      PaymentVoucherModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /paymentvoucher/by-supplier/:supplierId
  static async getBySupplier(supplierId, filters = {}) {
    const query = { supplier_id: supplierId };
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.status)        query.status        = filters.status;
    if (filters.from_date || filters.to_date) {
      query.pv_date = {};
      if (filters.from_date) query.pv_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.pv_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      PaymentVoucherModel.find(query).sort({ pv_date: -1 }).skip(skip).limit(limit).lean(),
      PaymentVoucherModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /paymentvoucher/by-tender/:tenderId
  static async getByTender(tenderId, filters = {}) {
    const query = { tender_id: tenderId };
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.status)        query.status        = filters.status;
    return await PaymentVoucherModel.find(query).sort({ pv_date: -1 }).lean();
  }

  // GET /paymentvoucher/:id
  static async getById(id) {
    const doc = await PaymentVoucherModel.findById(id).lean();
    if (!doc) throw new Error("Payment voucher not found");
    return doc;
  }

  // POST /paymentvoucher/create
  static async create(payload) {
    if (!payload.pv_no)         throw new Error("pv_no is required");
    if (!payload.supplier_id)   throw new Error("supplier_id is required");
    if (!payload.supplier_type) throw new Error("supplier_type is required");

    const supplierData = await resolveSupplier(payload.supplier_type, payload.supplier_id);
    Object.assign(payload, supplierData);

    validateEntriesBalance(payload.entries);

    const doc = buildDoc(payload, payload.pv_no);

    // If creating directly as approved, bank_account_code must be present
    if (doc.status === "approved" && !doc.bank_account_code) {
      throw new Error("bank_account_code is required when creating an approved payment voucher");
    }

    const saved = await PaymentVoucherModel.create(doc);

    if (saved.status === "approved") {
      await postToLedger(saved);
      await markBillsSettled(saved);
      await AccountTreeService.applyBalanceLines([{
        account_code: saved.bank_account_code,
        debit_amt:    0,
        credit_amt:   saved.amount,
      }]);
    }

    return saved;
  }

  // PATCH /paymentvoucher/update/:id
  static async update(id, payload) {
    const pv = await PaymentVoucherModel.findById(id);
    if (!pv) throw new Error("Payment voucher not found");
    if (pv.status === "approved") throw new Error("Cannot edit an approved payment voucher");

    const allowed = [
      "pv_date", "document_year", "payment_mode", "bank_account_code", "bank_name", "bank_ref",
      "cheque_no", "cheque_date", "bill_refs", "amount", "entries", "narration", "tender_id",
      "tender_ref", "tender_name", "gross_amount", "tds_section", "tds_pct",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) pv[field] = payload[field];
    }
    await pv.save();
    return pv;
  }

  // DELETE /paymentvoucher/delete/:id
  static async deleteDraft(id) {
    const pv = await PaymentVoucherModel.findById(id);
    if (!pv) throw new Error("Payment voucher not found");
    if (pv.status === "approved") throw new Error("Cannot delete an approved payment voucher");
    await pv.deleteOne();
    return { deleted: true, pv_no: pv.pv_no };
  }

  // PATCH /paymentvoucher/approve/:id
  // body may include { bank_account_code } to set it at approval time
  static async approve(id, body = {}) {
    const pv = await PaymentVoucherModel.findById(id);
    if (!pv)                      throw new Error("Payment voucher not found");
    if (pv.status === "approved") throw new Error("Already approved");

    // Allow setting bank_account_code at approval time (for existing PVs that lack it)
    if (body.bank_account_code) {
      pv.bank_account_code = body.bank_account_code;
    }

    // Validate BEFORE any state changes
    if (!pv.bank_account_code) {
      throw new Error("bank_account_code is required — pass it in the approve request body or set it on the voucher first");
    }

    pv.status = "approved";
    await pv.save();

    // Post to supplier ledger (Dr entry — clears payable)
    await postToLedger(pv);

    // Update every referenced bill with this PV's payment details
    await markBillsSettled(pv);

    // Reduce the paying bank account's opening_balance in AccountTree
    // Payment out = Cr to bank account (Dr normal Asset → balance decreases)
    await AccountTreeService.applyBalanceLines([{
      account_code: pv.bank_account_code,
      debit_amt:    0,
      credit_amt:   pv.amount,
    }]);

    return pv;
  }
}

export default PaymentVoucherService;
