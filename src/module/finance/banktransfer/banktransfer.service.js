import BankTransferModel from "./banktransfer.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import FinanceCounterModel from "../FinanceCounter.model.js";

// ── FY helper ─────────────────────────────────────────────────────────────────
function currentFY() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

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
  // Atomic via FinanceCounter — concurrent requests can never collide.
  static async getNextTransferNo() {
    const fy      = currentFY();
    const counter = await FinanceCounterModel.findByIdAndUpdate(
      `BT/${fy}`,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const transfer_no = `BT/${fy}/${String(counter.seq).padStart(4, "0")}`;
    return { transfer_no, is_first: counter.seq === 1 };
  }

  // GET /banktransfer/list
  static async getList(filters = {}) {
    const query = { is_deleted: { $ne: true } };
    if (filters.status)            query.status            = filters.status;
    if (filters.from_account_code) query.from_account_code = filters.from_account_code;
    if (filters.to_account_code)   query.to_account_code   = filters.to_account_code;
    if (filters.tender_id)         query.tender_id         = filters.tender_id;
    if (filters.transfer_no)       query.transfer_no       = filters.transfer_no;

    if (filters.search) {
      const s = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { transfer_no:        { $regex: s, $options: "i" } },
        { from_account_name:  { $regex: s, $options: "i" } },
        { to_account_name:    { $regex: s, $options: "i" } },
        { tender_id:          { $regex: s, $options: "i" } },
      ];
    }

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
    if (!doc) throw new Error("Bank transfer record not found. Please verify the transfer ID and try again");
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
    if (!bt) throw new Error("Bank transfer record not found. Please verify the transfer ID and try again");
    if (bt.status === "approved") throw new Error("Approved bank transfers cannot be edited. Please create a new transfer instead");

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
    if (!bt) throw new Error("Bank transfer record not found. Please verify the transfer ID and try again");
    if (bt.status === "approved") throw new Error("Approved bank transfers cannot be deleted");
    await bt.deleteOne();
    return { deleted: true, transfer_no: bt.transfer_no };
  }

  // PATCH /banktransfer/approve/:id
  //
  // On approval:
  //   1. Validate from/to accounts
  //   2. Mark transfer as approved
  //   3. Auto-post a JournalEntry — JE handles AccountTree balance updates AND
  //      shows up in the trial balance, general ledger, and cash flow reports
  //
  // Posting a JE (instead of calling applyBalanceLines directly) keeps BT
  // consistent with PV / RV / EV / WeeklyBilling, all of which go through
  // JournalEntryService.createFromVoucher.
  static async approve(id, approvedBy = null) {
    const bt = await BankTransferModel.findById(id);
    if (!bt)                       throw new Error("Bank transfer record not found. Please verify the transfer ID and try again");
    if (bt.status === "approved")  throw new Error("Bank transfer is already approved");
    if (!bt.amount || bt.amount <= 0) throw new Error("Transfer amount must be greater than 0");

    // Re-validate accounts at approval time
    const fromNode = await validateBankCashAccount(bt.from_account_code, "Source");
    const toNode   = await validateBankCashAccount(bt.to_account_code, "Destination");

    bt.status      = "approved";
    bt.approved_by = approvedBy;
    bt.approved_at = new Date();
    await bt.save();

    // Double-entry: Dr destination bank/cash, Cr source bank/cash
    const lines = [
      {
        account_code: bt.to_account_code,
        dr_cr:        "Dr",
        debit_amt:    r2(bt.amount),
        credit_amt:   0,
        narration:    `Inward transfer from ${fromNode.account_name}`,
      },
      {
        account_code: bt.from_account_code,
        dr_cr:        "Cr",
        debit_amt:    0,
        credit_amt:   r2(bt.amount),
        narration:    `Outward transfer to ${toNode.account_name}`,
      },
    ];

    const je = await JournalEntryService.createFromVoucher(lines, {
      je_type:     "Inter-Account Transfer",
      je_date:     bt.transfer_date || new Date(),
      narration:   `Bank Transfer ${bt.transfer_no} — ${fromNode.account_name} → ${toNode.account_name}${bt.narration ? " | " + bt.narration : ""}`,
      tender_id:   bt.tender_id,
      tender_name: bt.tender_name || "",
      source_ref:  bt._id,
      source_type: "BankTransfer",
      source_no:   bt.transfer_no,
    });

    if (je) {
      bt.je_ref = je._id;
      bt.je_no  = je.je_no;
      await bt.save();
    }

    return bt;
  }
}

export default BankTransferService;
