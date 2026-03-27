import BankTransferModel from "./banktransfer.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import AccountTreeService from "../accounttree/accounttree.service.js";

// ── FY helper ─────────────────────────────────────────────────────────────────
function currentFY() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

// ── Validate account_code exists and is a bank/cash posting account ──────────
async function validateBankCashAccount(code, label) {
  const node = await AccountTreeModel.findOne({
    account_code: code,
    is_deleted:   false,
  }).lean();

  if (!node)                  throw new Error(`${label} account '${code}' not found in Chart of Accounts`);
  if (node.is_group)          throw new Error(`${label} account '${code}' is a group — use a leaf account`);
  if (!node.is_posting_account) throw new Error(`${label} account '${code}' is not a posting account`);
  if (!node.is_bank_cash)     throw new Error(`${label} account '${code}' is not a bank/cash account`);

  return node;
}

// ── Service ───────────────────────────────────────────────────────────────────

class BankTransferService {

  // GET /banktransfer/next-no
  static async getNextTransferNo() {
    const fy     = currentFY();
    const prefix = `BT/${fy}/`;
    const last   = await BankTransferModel.findOne(
      { transfer_no: { $regex: `^${prefix}` } },
      { transfer_no: 1 }
    ).sort({ createdAt: -1 });

    const seq = last ? parseInt(last.transfer_no.split("/").pop(), 10) : 0;
    const transfer_no = `${prefix}${String(seq + 1).padStart(4, "0")}`;
    return { transfer_no, is_first: !last };
  }

  // GET /banktransfer/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.status)            query.status            = filters.status;
    if (filters.from_account_code) query.from_account_code = filters.from_account_code;
    if (filters.to_account_code)   query.to_account_code   = filters.to_account_code;
    if (filters.tender_id)         query.tender_id         = filters.tender_id;
    if (filters.transfer_no)       query.transfer_no       = filters.transfer_no;

    if (filters.from_date || filters.to_date) {
      query.transfer_date = {};
      if (filters.from_date) query.transfer_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.transfer_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      BankTransferModel.find(query).sort({ transfer_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      BankTransferModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /banktransfer/:id
  static async getById(id) {
    const doc = await BankTransferModel.findById(id).lean();
    if (!doc) throw new Error("Bank transfer not found");
    return doc;
  }

  // POST /banktransfer/create
  static async create(payload) {
    if (!payload.transfer_no)       throw new Error("transfer_no is required");
    if (!payload.from_account_code) throw new Error("from_account_code is required");
    if (!payload.to_account_code)   throw new Error("to_account_code is required");
    if (!payload.amount || payload.amount <= 0) throw new Error("amount must be greater than 0");

    if (payload.from_account_code === payload.to_account_code) {
      throw new Error("from_account_code and to_account_code cannot be the same");
    }

    // Validate both accounts are bank/cash posting accounts
    const fromNode = await validateBankCashAccount(payload.from_account_code, "Source");
    const toNode   = await validateBankCashAccount(payload.to_account_code, "Destination");

    const doc = {
      transfer_no:       payload.transfer_no,
      transfer_date:     payload.transfer_date ? new Date(payload.transfer_date) : new Date(),
      document_year:     payload.document_year || currentFY(),
      from_account_code: payload.from_account_code,
      from_account_name: payload.from_account_name || fromNode.account_name,
      to_account_code:   payload.to_account_code,
      to_account_name:   payload.to_account_name || toNode.account_name,
      amount:            Number(payload.amount),
      transfer_mode:     payload.transfer_mode || "NEFT",
      reference_no:      payload.reference_no  || "",
      cheque_no:         payload.cheque_no     || "",
      cheque_date:       payload.cheque_date   ? new Date(payload.cheque_date) : null,
      tender_id:         payload.tender_id     || "",
      tender_name:       payload.tender_name   || "",
      narration:         payload.narration     || `Transfer from ${fromNode.account_name} to ${toNode.account_name}`,
      status:            payload.status        || "pending",
      created_by:        payload.created_by    || "",
    };

    return await BankTransferModel.create(doc);
  }

  // PATCH /banktransfer/update/:id
  static async update(id, payload) {
    const bt = await BankTransferModel.findById(id);
    if (!bt) throw new Error("Bank transfer not found");
    if (bt.status === "approved") throw new Error("Cannot edit an approved bank transfer");

    // If changing accounts, re-validate
    if (payload.from_account_code) {
      await validateBankCashAccount(payload.from_account_code, "Source");
    }
    if (payload.to_account_code) {
      await validateBankCashAccount(payload.to_account_code, "Destination");
    }

    const from = payload.from_account_code || bt.from_account_code;
    const to   = payload.to_account_code   || bt.to_account_code;
    if (from === to) {
      throw new Error("from_account_code and to_account_code cannot be the same");
    }

    const allowed = [
      "transfer_date", "document_year",
      "from_account_code", "from_account_name",
      "to_account_code", "to_account_name",
      "amount", "transfer_mode", "reference_no",
      "cheque_no", "cheque_date",
      "tender_id", "tender_name", "narration",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) bt[field] = payload[field];
    }

    await bt.save();
    return bt;
  }

  // DELETE /banktransfer/delete/:id
  static async deleteDraft(id) {
    const bt = await BankTransferModel.findById(id);
    if (!bt) throw new Error("Bank transfer not found");
    if (bt.status === "approved") throw new Error("Cannot delete an approved bank transfer");
    await bt.deleteOne();
    return { deleted: true, transfer_no: bt.transfer_no };
  }

  // PATCH /banktransfer/approve/:id
  //
  // On approval:
  //   1. Validate from/to accounts
  //   2. Update account balances (Dr to_account, Cr from_account)
  static async approve(id, approvedBy = null) {
    const bt = await BankTransferModel.findById(id);
    if (!bt)                       throw new Error("Bank transfer not found");
    if (bt.status === "approved")  throw new Error("Already approved");
    if (!bt.amount || bt.amount <= 0) throw new Error("Transfer amount must be greater than 0");

    // Re-validate accounts at approval time
    await validateBankCashAccount(bt.from_account_code, "Source");
    await validateBankCashAccount(bt.to_account_code, "Destination");

    // Update account balances: Dr to_account, Cr from_account
    await AccountTreeService.applyBalanceLines([
      { account_code: bt.to_account_code,   debit_amt: bt.amount, credit_amt: 0 },
      { account_code: bt.from_account_code, debit_amt: 0,         credit_amt: bt.amount },
    ]);

    // Mark transfer as approved
    bt.status      = "approved";
    bt.approved_by = approvedBy;
    bt.approved_at = new Date();
    await bt.save();

    return bt;
  }
}

export default BankTransferService;
