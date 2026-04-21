import ExpenseVoucherModel from "./expensevoucher.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import AccountTreeService from "../accounttree/accounttree.service.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import FinanceCounterModel from "../FinanceCounter.model.js";
import EmployeeModel from "../../hr/employee/employee.model.js";
import TenderModel from "../../tender/tender/tender.model.js";
import { GL } from "../gl.constants.js";

// ── FY helper ─────────────────────────────────────────────────────────────────
function currentFY() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Validate paying account is a bank/cash posting leaf ──────────────────────
async function validatePayingAccount(code) {
  if (!code) return null;
  const node = await AccountTreeModel.findOne({
    account_code: code,
    is_deleted:   false,
  }).lean();
  if (!node)                     throw new Error(`Paying account '${code}' not found in Chart of Accounts`);
  if (node.is_group)             throw new Error(`Paying account '${code}' is a group — use a leaf account`);
  if (!node.is_posting_account)  throw new Error(`Paying account '${code}' is not a posting account`);
  if (!node.is_bank_cash)        throw new Error(`Paying account '${code}' is not a bank/cash account`);
  return node;
}

// ── Validate expense lines: each must point to a valid Expense (or Asset-prepaid) leaf ─
async function validateAndEnrichLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("At least one expense line is required");
  }

  const codes    = [...new Set(lines.map((l) => l.expense_account_code).filter(Boolean))];
  const accounts = await AccountTreeModel.find(
    { account_code: { $in: codes }, is_deleted: false }
  ).lean();
  const accMap = Object.fromEntries(accounts.map((a) => [a.account_code, a]));

  return lines.map((line, i) => {
    const code = line.expense_account_code;
    if (!code) throw new Error(`Line ${i + 1}: expense_account_code is required`);

    const acc = accMap[code];
    if (!acc)                   throw new Error(`Line ${i + 1}: Account '${code}' not found in Chart of Accounts`);
    if (acc.is_group)           throw new Error(`Line ${i + 1}: Account '${code}' (${acc.account_name}) is a group — use a leaf account`);
    if (!acc.is_posting_account) throw new Error(`Line ${i + 1}: Account '${code}' is not a posting account`);
    if (!["Expense", "Asset"].includes(acc.account_type)) {
      throw new Error(`Line ${i + 1}: Account '${code}' is of type '${acc.account_type}'. Expense voucher lines must book to Expense (or prepaid Asset) accounts`);
    }

    const amount = Number(line.amount) || 0;
    if (amount <= 0) throw new Error(`Line ${i + 1}: amount must be greater than 0`);

    return {
      expense_account_code: code,
      expense_account_name: acc.account_name,
      description:  line.description || "",
      amount:       r2(amount),
      gst_pct:      Number(line.gst_pct)  || 0,
      cgst_amt:     r2(Number(line.cgst_amt) || 0),
      sgst_amt:     r2(Number(line.sgst_amt) || 0),
      igst_amt:     r2(Number(line.igst_amt) || 0),
      line_total:   0,   // pre-save computes
      tender_id:    line.tender_id   || "",
      tender_ref:   line.tender_ref  || null,
      tender_name:  line.tender_name || "",
    };
  });
}

// ── Resolve optional employee payee ───────────────────────────────────────────
async function resolveEmployee(employee_id) {
  if (!employee_id) return {};
  const emp = await EmployeeModel.findOne({ employeeId: employee_id }).lean();
  if (!emp) throw new Error(`Employee '${employee_id}' not found. Please verify the employee ID and try again`);
  return { employee_ref: emp._id, payee_name: emp.name };
}

// ── Resolve optional tender at voucher level ──────────────────────────────────
async function resolveTender(tender_id) {
  if (!tender_id) return {};
  const t = await TenderModel.findOne({ tender_id }).lean();
  if (!t) throw new Error(`Tender '${tender_id}' not found. Please verify the tender ID and try again`);
  return { tender_ref: t._id, tender_name: t.tender_name };
}

// ── Build document ────────────────────────────────────────────────────────────
function buildDoc(payload, ev_no, enrichedLines) {
  return {
    ev_no,
    ev_date:       payload.ev_date ? new Date(payload.ev_date) : new Date(),
    document_year: payload.document_year || currentFY(),

    payee_name:   payload.payee_name || "",
    payee_type:   payload.payee_type || "External",
    employee_id:  payload.employee_id  || "",
    employee_ref: payload.employee_ref || null,

    paid_from_account_code: payload.paid_from_account_code || "",
    paid_from_account_name: payload.paid_from_account_name || "",

    payment_mode: payload.payment_mode || "Cash",
    reference_no: payload.reference_no || "",
    cheque_no:    payload.cheque_no    || "",
    cheque_date:  payload.cheque_date  ? new Date(payload.cheque_date) : null,

    lines: enrichedLines,

    tender_id:   payload.tender_id   || "",
    tender_ref:  payload.tender_ref  || null,
    tender_name: payload.tender_name || "",

    bill_photo_url: payload.bill_photo_url || "",
    bill_no:        payload.bill_no        || "",

    tds_section: payload.tds_section || "",
    tds_pct:     Number(payload.tds_pct) || 0,

    narration: payload.narration || "",
    status:    payload.status    || "pending",

    created_by: payload.created_by || null,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

class ExpenseVoucherService {

  // GET /expensevoucher/next-no  — preview only
  static async getNextEvNo() {
    const fy      = currentFY();
    const counter = await FinanceCounterModel.findById(`EV/${fy}`).lean();
    const nextSeq = counter ? counter.seq + 1 : 1;
    const ev_no   = `EV/${fy}/${String(nextSeq).padStart(4, "0")}`;
    return { ev_no, is_first: !counter };
  }

  static async #allocateEvNo() {
    const fy      = currentFY();
    const counter = await FinanceCounterModel.findByIdAndUpdate(
      `EV/${fy}`,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return `EV/${fy}/${String(counter.seq).padStart(4, "0")}`;
  }

  // GET /expensevoucher/list
  static async getList(filters = {}) {
    const query = { is_deleted: { $ne: true } };
    if (filters.status)        query.status        = filters.status;
    if (filters.payment_mode)  query.payment_mode  = filters.payment_mode;
    if (filters.payee_type)    query.payee_type    = filters.payee_type;
    if (filters.employee_id)   query.employee_id   = filters.employee_id;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.ev_no)         query.ev_no         = filters.ev_no;
    if (filters.paid_from_account_code) query.paid_from_account_code = filters.paid_from_account_code;
    if (filters.expense_account_code) query["lines.expense_account_code"] = filters.expense_account_code;

    if (filters.search) {
      const s = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { ev_no:      { $regex: s, $options: "i" } },
        { payee_name: { $regex: s, $options: "i" } },
        { narration:  { $regex: s, $options: "i" } },
        { tender_id:  { $regex: s, $options: "i" } },
        { bill_no:    { $regex: s, $options: "i" } },
      ];
    }

    if (filters.from_date || filters.to_date) {
      query.ev_date = {};
      if (filters.from_date) query.ev_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.ev_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      ExpenseVoucherModel.find(query).sort({ ev_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      ExpenseVoucherModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /expensevoucher/by-tender/:tenderId
  static async getByTender(tenderId, filters = {}) {
    const query = {
      is_deleted: { $ne: true },
      $or: [{ tender_id: tenderId }, { "lines.tender_id": tenderId }],
    };
    if (filters.status) query.status = filters.status;
    return await ExpenseVoucherModel.find(query).sort({ ev_date: -1 }).lean();
  }

  // GET /expensevoucher/by-employee/:employeeId
  static async getByEmployee(employeeId, filters = {}) {
    const query = { employee_id: employeeId, is_deleted: { $ne: true } };
    if (filters.status) query.status = filters.status;
    if (filters.from_date || filters.to_date) {
      query.ev_date = {};
      if (filters.from_date) query.ev_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.ev_date.$lte = to;
      }
    }
    return await ExpenseVoucherModel.find(query).sort({ ev_date: -1 }).lean();
  }

  // GET /expensevoucher/:id
  static async getById(id) {
    const doc = await ExpenseVoucherModel.findById(id).lean();
    if (!doc) throw new Error("Expense voucher not found. Please verify the voucher ID and try again");
    return doc;
  }

  // POST /expensevoucher/create
  static async create(payload) {
    const enrichedLines = await validateAndEnrichLines(payload.lines || []);

    // Resolve payee/tender references (non-fatal for the payee if only free-text name)
    const empData    = await resolveEmployee(payload.employee_id);
    const tenderData = await resolveTender(payload.tender_id);
    const merged     = { ...payload, ...empData, ...tenderData };

    if (merged.status === "approved" && !merged.paid_from_account_code) {
      throw new Error("paid_from_account_code is required when creating an approved expense voucher");
    }
    if (merged.paid_from_account_code) {
      const node = await validatePayingAccount(merged.paid_from_account_code);
      merged.paid_from_account_name = merged.paid_from_account_name || node.account_name;
    }

    const ev_no = await ExpenseVoucherService.#allocateEvNo();
    const doc   = buildDoc(merged, ev_no, enrichedLines);

    const saved = await ExpenseVoucherModel.create(doc);

    if (saved.status === "approved") {
      await ExpenseVoucherService.#postJE(saved);
    }

    return saved;
  }

  // PATCH /expensevoucher/update/:id  — only draft / pending
  static async update(id, payload) {
    const ev = await ExpenseVoucherModel.findById(id);
    if (!ev) throw new Error("Expense voucher not found. Please verify the voucher ID and try again");
    if (ev.status === "approved") throw new Error("Cannot edit an approved expense voucher. Please create a reversal journal entry instead");

    if (payload.lines) {
      ev.lines = await validateAndEnrichLines(payload.lines);
    }

    if (payload.employee_id !== undefined && payload.employee_id !== ev.employee_id) {
      const empData = await resolveEmployee(payload.employee_id);
      Object.assign(ev, empData, { employee_id: payload.employee_id });
    }
    if (payload.tender_id !== undefined && payload.tender_id !== ev.tender_id) {
      const tData = await resolveTender(payload.tender_id);
      Object.assign(ev, tData, { tender_id: payload.tender_id });
    }
    if (payload.paid_from_account_code !== undefined && payload.paid_from_account_code !== ev.paid_from_account_code) {
      const node = await validatePayingAccount(payload.paid_from_account_code);
      ev.paid_from_account_code = payload.paid_from_account_code;
      ev.paid_from_account_name = payload.paid_from_account_name || node.account_name;
    }

    const allowed = [
      "ev_date", "document_year", "payee_name", "payee_type",
      "payment_mode", "reference_no", "cheque_no", "cheque_date",
      "bill_photo_url", "bill_no",
      "tds_section", "tds_pct", "narration",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) ev[field] = payload[field];
    }

    await ev.save();
    return ev;
  }

  // DELETE /expensevoucher/delete/:id  — only draft / pending
  static async deleteDraft(id) {
    const ev = await ExpenseVoucherModel.findById(id);
    if (!ev) throw new Error("Expense voucher not found. Please verify the voucher ID and try again");
    if (ev.status === "approved") throw new Error("Cannot delete an approved expense voucher. Please create a reversal journal entry instead");
    await ev.deleteOne();
    return { deleted: true, ev_no: ev.ev_no };
  }

  // PATCH /expensevoucher/approve/:id
  // body may include { paid_from_account_code } to set it at approval time
  static async approve(id, body = {}, approvedBy = null) {
    const ev = await ExpenseVoucherModel.findById(id);
    if (!ev)                      throw new Error("Expense voucher not found. Please verify the voucher ID and try again");
    if (ev.status === "approved") throw new Error("Expense voucher has already been approved");

    if (body.paid_from_account_code) {
      const node = await validatePayingAccount(body.paid_from_account_code);
      ev.paid_from_account_code = body.paid_from_account_code;
      ev.paid_from_account_name = body.paid_from_account_name || node.account_name;
    }
    if (!ev.paid_from_account_code) {
      throw new Error("paid_from_account_code is required to approve this expense voucher. Please provide it in the request or update the voucher first");
    }
    // Re-validate on approval in case chart of accounts changed
    await validatePayingAccount(ev.paid_from_account_code);

    ev.status      = "approved";
    ev.approved_by = approvedBy;
    ev.approved_at = new Date();
    await ev.save();

    await ExpenseVoucherService.#postJE(ev);

    return ev;
  }

  // ── Build and post the double-entry JE for an expense voucher ────────────
  // Dr: each expense_account_code line (amount + its tax portion)
  // Dr: CGST/SGST/IGST Input (aggregated across lines, when GST is charged)
  // Cr: TDS Payable (2140) — if any TDS
  // Cr: Paying bank/cash account (net_paid = gross_total − tds_amt)
  //
  // Note: we split the GST out so the expense account gets only the pre-tax amount,
  // which is the standard Indian accounting practice (ITC sits on a separate account).
  static async #postJE(ev) {
    const lines = [];

    // Dr each expense line (pre-tax amount only)
    // tender_id propagated per-line so P&L by tender stays accurate when an EV
    // splits its cost across multiple projects (header tender_id remains empty).
    for (const l of ev.lines) {
      if (l.amount > 0) {
        lines.push({
          account_code: l.expense_account_code,
          dr_cr:        "Dr",
          debit_amt:    r2(l.amount),
          credit_amt:   0,
          narration:    l.description || "",
          tender_id:    l.tender_id || ev.tender_id || "",
        });
      }
    }

    // Dr aggregated GST Input (if any)
    const sumCgst = r2(ev.lines.reduce((s, l) => s + (l.cgst_amt || 0), 0));
    const sumSgst = r2(ev.lines.reduce((s, l) => s + (l.sgst_amt || 0), 0));
    const sumIgst = r2(ev.lines.reduce((s, l) => s + (l.igst_amt || 0), 0));
    if (sumCgst > 0) lines.push({ account_code: GL.GST_INPUT_CGST, dr_cr: "Dr", debit_amt: sumCgst, credit_amt: 0, narration: "CGST Input" });
    if (sumSgst > 0) lines.push({ account_code: GL.GST_INPUT_SGST, dr_cr: "Dr", debit_amt: sumSgst, credit_amt: 0, narration: "SGST Input" });
    if (sumIgst > 0) lines.push({ account_code: GL.GST_INPUT_IGST, dr_cr: "Dr", debit_amt: sumIgst, credit_amt: 0, narration: "IGST Input" });

    // Cr TDS Payable (if any)
    if (ev.tds_amt > 0) {
      lines.push({
        account_code: GL.TDS_PAYABLE,
        dr_cr:        "Cr",
        debit_amt:    0,
        credit_amt:   r2(ev.tds_amt),
        narration:    `TDS withheld ${ev.tds_section}`,
      });
    }

    // Cr paying bank/cash
    lines.push({
      account_code: ev.paid_from_account_code,
      dr_cr:        "Cr",
      debit_amt:    0,
      credit_amt:   r2(ev.net_paid),
      narration:    "Expense paid",
    });

    const je = await JournalEntryService.createFromVoucher(lines, {
      je_type:     "Expense Voucher",
      je_date:     ev.ev_date || new Date(),
      narration:   `Expense Voucher ${ev.ev_no}${ev.payee_name ? " — " + ev.payee_name : ""}${ev.narration ? " | " + ev.narration : ""}`,
      tender_id:   ev.tender_id,
      tender_ref:  ev.tender_ref,
      tender_name: ev.tender_name || "",
      source_ref:  ev._id,
      source_type: "ExpenseVoucher",
      source_no:   ev.ev_no,
    });

    if (je?._id) {
      await ExpenseVoucherModel.findByIdAndUpdate(ev._id, { je_ref: je._id, je_no: je.je_no });
    } else {
      // JE failed — still update the paying account balance manually so reports don't drift
      await AccountTreeService.applyBalanceLines([
        { account_code: ev.paid_from_account_code, debit_amt: 0, credit_amt: r2(ev.net_paid) },
      ]);
    }
  }
}

export default ExpenseVoucherService;
