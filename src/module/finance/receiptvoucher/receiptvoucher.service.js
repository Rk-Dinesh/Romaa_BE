import ReceiptVoucherModel from "./receiptvoucher.model.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import ContractorModel from "../../hr/contractors/contractor.model.js";
import LedgerService from "../ledger/ledger.service.js";
import AccountTreeService from "../accounttree/accounttree.service.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import FinanceCounterModel from "../FinanceCounter.model.js";
import ClientModel from "../../clients/client.model.js";
import BillingModel from "../clientbilling/clientbilling/clientbilling.model.js";

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
    if (!vendor) throw new Error(`Vendor '${supplier_id}' not found. Please verify the vendor ID and try again`);
    return {
      supplier_ref:   vendor._id,
      supplier_name:  vendor.company_name,
      supplier_gstin: vendor.gstin || "",
    };
  }

  if (supplier_type === "Contractor") {
    const contractor = await ContractorModel.findOne({ contractor_id: supplier_id }).lean();
    if (!contractor) throw new Error(`Contractor '${supplier_id}' not found. Please verify the contractor ID and try again`);
    return {
      supplier_ref:   contractor._id,
      supplier_name:  contractor.contractor_name,
      supplier_gstin: contractor.gst_number || "",
    };
  }

  if (supplier_type === "Client") {
    const client = await ClientModel.findOne({ client_id: supplier_id }).lean();
    if (!client) throw new Error(`Client '${supplier_id}' not found. Please verify the client ID and try again`);
    return {
      supplier_ref:   client._id,
      supplier_name:  client.client_name,
      supplier_gstin: client.gstin || "",
    };
  }

  throw new Error(`Invalid supplier type '${supplier_type}'. Accepted values are: Vendor, Contractor, Client`);
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

    bill_refs: (payload.bill_refs || []).map((b) => ({
      bill_type:   "ClientBilling",
      bill_ref:    b.bill_ref    || null,
      bill_no:     b.bill_no     || "",
      settled_amt: Number(b.settled_amt) || 0,
    })),

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

// ── Mark referenced client bills as (partially) received ─────────────────────
// Called after an RV is approved. For each bill_ref:
//   1. Pushes a payment_refs entry onto the client bill
//   2. Increments amount_received
//   3. Recomputes paid_status (unpaid / partial / paid)
async function markBillsReceived(rv) {
  if (!rv.bill_refs || rv.bill_refs.length === 0) return;

  for (const ref of rv.bill_refs) {
    if (!ref.bill_ref || !(ref.settled_amt > 0)) continue;

    const bill = await BillingModel.findById(ref.bill_ref);
    if (!bill) continue;

    // Append the new receipt record
    bill.payment_refs.push({
      rv_ref:    rv._id,
      rv_no:     rv.rv_no,
      recv_amt:  ref.settled_amt,
      recv_date: rv.rv_date || new Date(),
    });

    // Accumulate received amount
    bill.amount_received = Math.round(((bill.amount_received || 0) + ref.settled_amt) * 100) / 100;

    // Recompute paid_status against net_amount
    const totalReceived = bill.amount_received;
    const billTotal     = bill.net_amount || 0;

    if (totalReceived >= billTotal) {
      bill.paid_status = "paid";
    } else if (totalReceived > 0) {
      bill.paid_status = "partial";
    } else {
      bill.paid_status = "unpaid";
    }

    // pre-save hook recomputes balance_due = net_amount - amount_received
    await bill.save();
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

class ReceiptVoucherService {

  // GET /receiptvoucher/next-no  — preview only, does NOT increment
  static async getNextRvNo() {
    const fy      = currentFY();
    const counter = await FinanceCounterModel.findById(`RV/${fy}`).lean();
    const nextSeq = counter ? counter.seq + 1 : 1;
    const rv_no   = `RV/${fy}/${String(nextSeq).padStart(4, "0")}`;
    return { rv_no, is_first: !counter };
  }

  // Internal: atomically allocate the next RV number
  static async #allocateRvNo() {
    const fy      = currentFY();
    const counter = await FinanceCounterModel.findByIdAndUpdate(
      `RV/${fy}`,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return `RV/${fy}/${String(counter.seq).padStart(4, "0")}`;
  }

  // ── Build and post the double-entry JE for a receipt voucher ─────────────────
  // Dr: Bank / Cash account — cash comes in
  // Cr: Supplier account — reduces advance outstanding or reverses their balance
  static async #postJE(rv) {
    const supplierAccCode = await JournalEntryService.getSupplierAccountCode(rv.supplier_type, rv.supplier_id);

    const jeLines = [
      { account_code: rv.bank_account_code, dr_cr: "Dr", debit_amt: rv.amount, credit_amt: 0, narration: "Receipt in" },
    ];
    if (supplierAccCode) {
      jeLines.push({ account_code: supplierAccCode, dr_cr: "Cr", debit_amt: 0, credit_amt: rv.amount, narration: "Supplier advance / balance reduced" });
    }

    const je = await JournalEntryService.createFromVoucher(jeLines, {
      je_type:     "Receipt",
      je_date:     rv.rv_date || new Date(),
      narration:   `Receipt Voucher ${rv.rv_no} — ${rv.supplier_name}${rv.narration ? " | " + rv.narration : ""}`,
      tender_id:   rv.tender_id,
      tender_name: rv.tender_name || "",
      source_ref:  rv._id,
      source_type:             "ReceiptVoucher",
      source_no:               rv.rv_no,
      skip_ledger_cross_post:  true,  // postToLedger() already posted to supplier ledger
    });

    if (je?._id) {
      await ReceiptVoucherModel.findByIdAndUpdate(rv._id, { je_ref: je._id, je_no: je.je_no });
    } else if (!supplierAccCode) {
      // JE not posted (no supplier account code) — fall back to manual bank balance update
      await AccountTreeService.applyBalanceLines([{
        account_code: rv.bank_account_code,
        debit_amt:    rv.amount,
        credit_amt:   0,
      }]);
    }
  }

  // GET /receiptvoucher/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.status)        query.status        = filters.status;
    if (filters.receipt_mode) {
      // "bank" is a virtual keyword → match all non-cash modes
      if (filters.receipt_mode === "bank") {
        query.receipt_mode = { $in: ["Cheque", "NEFT", "RTGS", "UPI", "DD"] };
      } else {
        query.receipt_mode = filters.receipt_mode;
      }
    }
    if (filters.rv_no)         query.rv_no         = filters.rv_no;

    if (filters.search) {
      const s = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { rv_no:         { $regex: s, $options: "i" } },
        { supplier_name: { $regex: s, $options: "i" } },
        { tender_id:     { $regex: s, $options: "i" } },
        { narration:     { $regex: s, $options: "i" } },
      ];
    }

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
    if (!doc) throw new Error("Receipt voucher not found. Please verify the voucher ID and try again");
    return doc;
  }

  // POST /receiptvoucher/create
  static async create(payload) {
    if (!payload.supplier_id)   throw new Error("Supplier ID is required to create a receipt voucher");
    if (!payload.supplier_type) throw new Error("Supplier type is required to create a receipt voucher");

    const supplierData = await resolveSupplier(payload.supplier_type, payload.supplier_id);
    Object.assign(payload, supplierData);

    validateEntriesBalance(payload.entries);

    // Atomically allocate rv_no (ignore any client-supplied value to prevent duplicates)
    const rv_no = await ReceiptVoucherService.#allocateRvNo();
    const doc   = buildDoc(payload, rv_no);

    // If creating directly as approved, bank_account_code must be present
    if (doc.status === "approved" && !doc.bank_account_code) {
      throw new Error("Bank account code is required when creating an approved receipt voucher");
    }

    const saved = await ReceiptVoucherModel.create(doc);

    if (saved.status === "approved") {
      await postToLedger(saved);
      await markBillsReceived(saved);
      await ReceiptVoucherService.#postJE(saved);
    }

    return saved;
  }

  // PATCH /receiptvoucher/update/:id
  static async update(id, payload) {
    const rv = await ReceiptVoucherModel.findById(id);
    if (!rv) throw new Error("Receipt voucher not found. Please verify the voucher ID and try again");
    if (rv.status === "approved") throw new Error("Cannot edit an approved receipt voucher. Create a reversal entry instead");

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
    if (!rv) throw new Error("Receipt voucher not found. Please verify the voucher ID and try again");
    if (rv.status === "approved") throw new Error("Cannot delete an approved receipt voucher. Create a reversal entry instead");
    await rv.deleteOne();
    return { deleted: true, rv_no: rv.rv_no };
  }

  // PATCH /receiptvoucher/approve/:id
  // body may include { bank_account_code } to set it at approval time
  static async approve(id, body = {}) {
    const rv = await ReceiptVoucherModel.findById(id);
    if (!rv)                      throw new Error("Receipt voucher not found. Please verify the voucher ID and try again");
    if (rv.status === "approved") throw new Error("Receipt voucher has already been approved");

    // Allow setting bank_account_code at approval time
    if (body.bank_account_code) {
      rv.bank_account_code = body.bank_account_code;
    }

    // Validate BEFORE any state changes
    if (!rv.bank_account_code) {
      throw new Error("Bank account code is required to approve this receipt voucher. Please provide it in the request or update the voucher first");
    }

    rv.status = "approved";
    await rv.save();

    // 1. Post to supplier sub-ledger (Dr entry — reduces supplier balance)
    await postToLedger(rv);

    // 2. Update every referenced client bill with this RV's receipt details
    await markBillsReceived(rv);

    // 3. Post double-entry JE: Dr bank / Cr supplier account
    //    (JE service also updates AccountTree available_balance for both sides)
    await ReceiptVoucherService.#postJE(rv);

    return rv;
  }
}

export default ReceiptVoucherService;
