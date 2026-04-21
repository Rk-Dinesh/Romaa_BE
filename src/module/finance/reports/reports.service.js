import JournalEntryModel from "../journalentry/journalentry.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import ClientBillingModel from "../clientbilling/clientbilling/clientbilling.model.js";
import ClientCNModel from "../clientcreditnote/clientcreditnote.model.js";
import PurchaseBillModel from "../purchasebill/purchasebill.model.js";
import DebitNoteModel from "../debitnote/debitnote.model.js";
import ExpenseVoucherModel from "../expensevoucher/expensevoucher.model.js";
import PaymentVoucherModel from "../paymentvoucher/paymentvoucher.model.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import ContractorModel from "../../hr/contractors/contractor.model.js";
import EmployeeModel from "../../hr/employee/employee.model.js";
import ClientModel from "../../clients/client.model.js";
import WeeklyBillingModel from "../weeklyBilling/WeeklyBilling.model.js";
import { PayrollModel } from "../../hr/payroll/payroll.model.js";
import MaterialModel from "../../tender/materials/material.model.js";
import TenderModel from "../../tender/tender/tender.model.js";
import { GL, GST_INPUT_CODES, GST_OUTPUT_CODES } from "../gl.constants.js";

// ── GST account codes (sourced from ../gl.constants.js) ──────────────────────
const TDS_PAYABLE_CODE = GL.TDS_PAYABLE;

// ── Financial Reports Service ─────────────────────────────────────────────────
//
// All reports derive from two sources:
//   1. AccountTree  — chart of accounts + opening_balance (pre-system migration value)
//   2. JournalEntry — every approved double-entry transaction since go-live
//
// No data is ever STORED here — every query recomputes from the audit trail so
// back-dated JE corrections always reflect accurately.
//
// Key invariants:
//   - Only JEs with status="approved" are included (drafts are ignored)
//   - Opening balance is the "pre-ledger" starting point, JE movement is the history
//   - For Asset/Expense (Dr-normal): closing = opening + Σdebit − Σcredit  (positive = Dr balance)
//   - For Liability/Equity/Income (Cr-normal): closing = opening + Σcredit − Σdebit  (positive = Cr balance)

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Current financial year helper ────────────────────────────────────────────
// Returns "YY-YY" for the current date (e.g. "25-26" from April 2025 onward).
const currentFY = () => {
  const now  = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
};

// Sign of opening_balance for running-balance math:
//   "Dr" → +opening on a Dr-normal account, −opening on a Cr-normal account
//   "Cr" → opposite
// We always work internally in signed Dr-positive units, then flip at the end.
function signedOpening(opening_balance, opening_balance_type) {
  const ob = Number(opening_balance) || 0;
  if (!ob) return 0;
  // Dr-positive convention: Dr means +, Cr means −
  return opening_balance_type === "Dr" ? ob : -ob;
}

// ── TDS quarter calendar helper ──────────────────────────────────────────────
// Used by Form 24Q, 26Q, 16, 16A. FY-aligned quarters:
//   Q1 Apr-Jun (due 31 Jul)   Q2 Jul-Sep (due 31 Oct)
//   Q3 Oct-Dec (due 31 Jan)   Q4 Jan-Mar (due 31 May)
function tdsQuarterRange(financial_year, quarter) {
  const fyStartYear = 2000 + parseInt(financial_year.split("-")[0], 10);
  const QMAP = {
    Q1: { fromM: 3,  toM: 5,  fromY: fyStartYear,     toY: fyStartYear,     dueDate: `${fyStartYear}-07-31`     },
    Q2: { fromM: 6,  toM: 8,  fromY: fyStartYear,     toY: fyStartYear,     dueDate: `${fyStartYear}-10-31`     },
    Q3: { fromM: 9,  toM: 11, fromY: fyStartYear,     toY: fyStartYear,     dueDate: `${fyStartYear + 1}-01-31` },
    Q4: { fromM: 0,  toM: 2,  fromY: fyStartYear + 1, toY: fyStartYear + 1, dueDate: `${fyStartYear + 1}-05-31` },
  };
  const q = QMAP[quarter];
  if (!q) throw new Error(`Invalid quarter '${quarter}' (expected Q1|Q2|Q3|Q4)`);
  return {
    from:    new Date(q.fromY, q.fromM, 1, 0, 0, 0, 0),
    to:      new Date(q.toY,   q.toM + 1, 0, 23, 59, 59, 999),
    dueDate: q.dueDate,
  };
}

// FY helper — returns "YY-YY" for a given date
function getFY(date) {
  const d     = new Date(date);
  const month = d.getMonth() + 1;
  const year  = d.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

// Start of FY → 1 April of the start year
function fyStart(fy) {
  // fy = "25-26" → April 1, 2025
  const startYY = parseInt(fy.split("-")[0], 10);
  const century = new Date().getFullYear() >= 2100 ? 2100 : 2000;  // crude but works till 2099
  const year    = century + startYY;
  return new Date(year, 3, 1, 0, 0, 0, 0);
}

// ── Aggregate JE line movements grouped by account_code ───────────────────────
// Returns: { [account_code]: { total_debit, total_credit } }
//
// tender_id matching:
//   The voucher-level tender on the JE catches whole-voucher tagging
//   (PurchaseBill, WeeklyBilling, etc.). ExpenseVoucher splits cost across lines
//   so each line carries its own tender_id — we pass that down via $unwind and
//   match either the JE-level OR the line-level tender_id.
async function aggregateMovements({ from_date, to_date, tender_id, account_codes } = {}) {
  const match = { status: "approved" };

  if (from_date || to_date) {
    match.je_date = {};
    if (from_date) match.je_date.$gte = new Date(from_date);
    if (to_date) {
      const to = new Date(to_date);
      to.setHours(23, 59, 59, 999);
      match.je_date.$lte = to;
    }
  }

  const pipeline = [
    { $match: match },
    { $unwind: "$lines" },
  ];

  // Tender filter — match if header tender_id OR line.tender_id matches.
  // Line-level catches per-line tender splits (e.g. ExpenseVoucher.lines[].tender_id
  // is propagated into JE line.narration / supplier_ref usage; for now we only
  // have header tender_id on the JE itself, but we keep the door open for future
  // line-level tagging by also matching lines.tender_id when present).
  if (tender_id) {
    pipeline.push({
      $match: {
        $or: [
          { tender_id },
          { "lines.tender_id": tender_id },
        ],
      },
    });
  }

  if (account_codes?.length) {
    pipeline.push({ $match: { "lines.account_code": { $in: account_codes } } });
  }

  pipeline.push({
    $group: {
      _id: "$lines.account_code",
      total_debit:  { $sum: "$lines.debit_amt"  },
      total_credit: { $sum: "$lines.credit_amt" },
    },
  });

  const rows = await JournalEntryModel.aggregate(pipeline);
  const map = {};
  for (const r of rows) {
    map[r._id] = {
      total_debit:  r2(r.total_debit),
      total_credit: r2(r.total_credit),
    };
  }
  return map;
}

class ReportsService {

  // ── GET /reports/trial-balance?as_of_date=&financial_year=&include_zero=false ─
  //
  // Returns every posting leaf account with:
  //   opening_balance (Dr/Cr)    — static, from AccountTree
  //   period_debit / period_credit — Σ from JE lines up to as_of_date
  //   closing_balance (Dr/Cr)    — opening + period movement
  //
  // Grand totals: total_debit must equal total_credit (self-verification)
  static async trialBalance({ as_of_date, include_zero = false } = {}) {
    const asOf = as_of_date ? new Date(as_of_date) : new Date();
    asOf.setHours(23, 59, 59, 999);

    // 1. All posting leaves
    const accounts = await AccountTreeModel.find({
      is_deleted: false,
      is_group:   false,
      is_posting_account: true,
    })
      .select("account_code account_name account_type account_subtype normal_balance opening_balance opening_balance_type")
      .sort({ account_code: 1 })
      .lean();

    // 2. Aggregate JE movements up to as_of_date
    const movements = await aggregateMovements({ to_date: asOf });

    // 3. Compose rows
    let totalDebit  = 0;
    let totalCredit = 0;

    const rows = accounts.map((acc) => {
      const mv = movements[acc.account_code] || { total_debit: 0, total_credit: 0 };

      // Signed (Dr-positive) math
      const openSigned  = signedOpening(acc.opening_balance, acc.opening_balance_type);
      const moveSigned  = r2(mv.total_debit - mv.total_credit);
      const closeSigned = r2(openSigned + moveSigned);

      const closing_balance      = Math.abs(closeSigned);
      const closing_balance_type = closeSigned === 0 ? "" : (closeSigned > 0 ? "Dr" : "Cr");

      if (closing_balance_type === "Dr") totalDebit  += closing_balance;
      if (closing_balance_type === "Cr") totalCredit += closing_balance;

      return {
        account_code:           acc.account_code,
        account_name:           acc.account_name,
        account_type:           acc.account_type,
        account_subtype:        acc.account_subtype,
        normal_balance:         acc.normal_balance,
        opening_balance:        r2(acc.opening_balance || 0),
        opening_balance_type:   acc.opening_balance_type || "",
        period_debit:           mv.total_debit,
        period_credit:          mv.total_credit,
        closing_balance:        r2(closing_balance),
        closing_balance_type,
      };
    });

    const filtered = include_zero
      ? rows
      : rows.filter(
          (r) =>
            r.opening_balance !== 0 ||
            r.period_debit    !== 0 ||
            r.period_credit   !== 0
        );

    return {
      as_of_date:      asOf,
      rows:            filtered,
      total_debit:     r2(totalDebit),
      total_credit:    r2(totalCredit),
      is_balanced:     r2(totalDebit - totalCredit) === 0,
      difference:      r2(totalDebit - totalCredit),
    };
  }

  // ── GET /reports/profit-loss?from_date=&to_date=&tender_id= ─────────────────
  //
  // Income  (4xxx) − Expense (5xxx) = Net Profit for the period.
  // Grouped by account_subtype for readable output.
  //
  // Pure period report — opening balances NOT included (P&L is a flow statement).
  static async profitLoss({ from_date, to_date, tender_id } = {}) {
    const now    = new Date();
    const fyStr  = getFY(now);
    const from   = from_date ? new Date(from_date) : fyStart(fyStr);
    const to     = to_date   ? new Date(to_date)   : now;
    to.setHours(23, 59, 59, 999);

    // Get Income + Expense accounts
    const accounts = await AccountTreeModel.find({
      is_deleted: false,
      is_group:   false,
      is_posting_account: true,
      account_type: { $in: ["Income", "Expense"] },
    })
      .select("account_code account_name account_type account_subtype")
      .sort({ account_code: 1 })
      .lean();

    const codes = accounts.map((a) => a.account_code);

    const movements = await aggregateMovements({
      from_date: from,
      to_date:   to,
      tender_id,
      account_codes: codes,
    });

    // Build line rows — net = credit − debit for Income (Cr-normal, positive = income earned)
    //                   net = debit − credit for Expense (Dr-normal, positive = cost incurred)
    const incomeRows  = [];
    const expenseRows = [];
    let totalIncome   = 0;
    let totalExpense  = 0;

    for (const acc of accounts) {
      const mv = movements[acc.account_code];
      if (!mv) continue;
      const netCr = r2(mv.total_credit - mv.total_debit);  // positive income
      const netDr = r2(mv.total_debit  - mv.total_credit); // positive expense

      if (acc.account_type === "Income") {
        if (netCr === 0) continue;
        incomeRows.push({
          account_code:    acc.account_code,
          account_name:    acc.account_name,
          account_subtype: acc.account_subtype,
          amount:          netCr,
        });
        totalIncome += netCr;
      } else {
        if (netDr === 0) continue;
        expenseRows.push({
          account_code:    acc.account_code,
          account_name:    acc.account_name,
          account_subtype: acc.account_subtype,
          amount:          netDr,
        });
        totalExpense += netDr;
      }
    }

    // Group by subtype for summary
    const groupBySubtype = (rows) => {
      const map = {};
      for (const r of rows) {
        const key = r.account_subtype || "Other";
        if (!map[key]) map[key] = { subtotal: 0, lines: [] };
        map[key].subtotal += r.amount;
        map[key].lines.push(r);
      }
      return Object.entries(map).map(([subtype, v]) => ({
        subtype,
        subtotal: r2(v.subtotal),
        lines:    v.lines,
      }));
    };

    totalIncome  = r2(totalIncome);
    totalExpense = r2(totalExpense);
    const netProfit = r2(totalIncome - totalExpense);

    return {
      from_date:     from,
      to_date:       to,
      tender_id:     tender_id || null,
      income: {
        total:  totalIncome,
        groups: groupBySubtype(incomeRows),
      },
      expense: {
        total:  totalExpense,
        groups: groupBySubtype(expenseRows),
      },
      net_profit:    netProfit,
      net_profit_type: netProfit >= 0 ? "Profit" : "Loss",
    };
  }

  // ── GET /reports/balance-sheet?as_of_date= ──────────────────────────────────
  //
  // Assets = Liabilities + Equity + (Retained Earnings from P&L)
  //
  // Computed by taking closing balances of Asset/Liability/Equity accounts at as_of_date,
  // then rolling Income − Expense from FY start → as_of_date into "Retained Earnings".
  static async balanceSheet({ as_of_date } = {}) {
    const asOf = as_of_date ? new Date(as_of_date) : new Date();
    asOf.setHours(23, 59, 59, 999);
    const fyStr = getFY(asOf);
    const from  = fyStart(fyStr);

    const accounts = await AccountTreeModel.find({
      is_deleted: false,
      is_group:   false,
      is_posting_account: true,
    })
      .select("account_code account_name account_type account_subtype opening_balance opening_balance_type")
      .sort({ account_code: 1 })
      .lean();

    const movements = await aggregateMovements({ to_date: asOf });

    // Helper: compute signed closing (Dr-positive)
    const closingSigned = (acc) => {
      const mv        = movements[acc.account_code] || { total_debit: 0, total_credit: 0 };
      const opening   = signedOpening(acc.opening_balance, acc.opening_balance_type);
      return r2(opening + mv.total_debit - mv.total_credit);
    };

    const buildRow = (acc) => {
      const signed = closingSigned(acc);
      // Display as positive on natural side:
      //   Asset/Expense → Dr (positive signed = positive display)
      //   Liability/Equity/Income → Cr (positive displayed = |negative signed|)
      let amount;
      if (["Asset", "Expense"].includes(acc.account_type)) {
        amount = signed;          // negative shown as negative (contra)
      } else {
        amount = r2(-signed);     // flip sign for Cr-normal accounts
      }
      return {
        account_code:    acc.account_code,
        account_name:    acc.account_name,
        account_subtype: acc.account_subtype,
        amount:          r2(amount),
      };
    };

    const assets      = accounts.filter((a) => a.account_type === "Asset");
    const liabilities = accounts.filter((a) => a.account_type === "Liability");
    const equities    = accounts.filter((a) => a.account_type === "Equity");

    // Retained earnings = Income total − Expense total from FY start → asOf
    // (movements map already uses open-range; need separate FY-scoped aggregation)
    const fyMovements = await aggregateMovements({ from_date: from, to_date: asOf });
    let income  = 0;
    let expense = 0;
    for (const acc of accounts) {
      const mv = fyMovements[acc.account_code];
      if (!mv) continue;
      if (acc.account_type === "Income")  income  += (mv.total_credit - mv.total_debit);
      if (acc.account_type === "Expense") expense += (mv.total_debit  - mv.total_credit);
    }
    const retainedEarnings = r2(income - expense);

    const mapWithTotals = (rows) => {
      const built    = rows.map(buildRow).filter((r) => r.amount !== 0);
      const subtotal = r2(built.reduce((s, r) => s + r.amount, 0));
      return { subtotal, lines: built };
    };

    const assetBlock     = mapWithTotals(assets);
    const liabilityBlock = mapWithTotals(liabilities);
    const equityBlock    = mapWithTotals(equities);

    const totalLiabilitiesEquity = r2(liabilityBlock.subtotal + equityBlock.subtotal + retainedEarnings);

    return {
      as_of_date:             asOf,
      financial_year:         fyStr,
      assets:                 assetBlock,
      liabilities:            liabilityBlock,
      equity:                 equityBlock,
      retained_earnings:      retainedEarnings,
      total_assets:           assetBlock.subtotal,
      total_liab_equity:      totalLiabilitiesEquity,
      is_balanced:            r2(assetBlock.subtotal - totalLiabilitiesEquity) === 0,
      difference:             r2(assetBlock.subtotal - totalLiabilitiesEquity),
    };
  }

  // ── GET /reports/general-ledger?account_code=&from_date=&to_date=&page=&limit= ─
  //
  // Chronological list of all JE lines for a single account_code with running balance.
  // Opening balance row is computed from: opening_balance + all movement before from_date.
  static async generalLedger({ account_code, from_date, to_date, page, limit } = {}) {
    if (!account_code) throw new Error("account_code is required for General Ledger report");

    const account = await AccountTreeModel.findOne({
      account_code,
      is_deleted: false,
    }).lean();
    if (!account) throw new Error(`Account '${account_code}' not found in Chart of Accounts`);
    if (account.is_group) throw new Error(`Account '${account_code}' is a group — select a leaf account`);

    const from = from_date ? new Date(from_date) : new Date(0);
    const to   = to_date   ? new Date(to_date)   : new Date();
    to.setHours(23, 59, 59, 999);

    // Opening balance at from_date = opening_balance + movements < from_date
    const openingSigned = signedOpening(account.opening_balance, account.opening_balance_type);

    let priorSigned = openingSigned;
    if (from > new Date(0)) {
      const prior = await JournalEntryModel.aggregate([
        { $match: { status: "approved", je_date: { $lt: from } } },
        { $unwind: "$lines" },
        { $match: { "lines.account_code": account_code } },
        { $group: {
            _id: null,
            total_debit:  { $sum: "$lines.debit_amt"  },
            total_credit: { $sum: "$lines.credit_amt" },
        }},
      ]);
      if (prior[0]) {
        priorSigned = r2(priorSigned + (prior[0].total_debit - prior[0].total_credit));
      }
    }

    // Count + paginate
    const pageN  = Math.max(1, parseInt(page)  || 1);
    const limitN = Math.max(1, Math.min(500, parseInt(limit) || 100));
    const skip   = (pageN - 1) * limitN;

    const [totalCount, rows] = await Promise.all([
      JournalEntryModel.aggregate([
        { $match: { status: "approved", je_date: { $gte: from, $lte: to } } },
        { $unwind: "$lines" },
        { $match: { "lines.account_code": account_code } },
        { $count: "n" },
      ]),
      JournalEntryModel.aggregate([
        { $match: { status: "approved", je_date: { $gte: from, $lte: to } } },
        { $unwind: "$lines" },
        { $match: { "lines.account_code": account_code } },
        { $sort: { je_date: 1, createdAt: 1 } },
        { $skip: skip },
        { $limit: limitN },
        { $project: {
            _id: 0,
            je_id:       "$_id",
            je_no:       1,
            je_date:     1,
            je_type:     1,
            narration:   1,
            source_no:   1,
            source_type: 1,
            tender_id:   1,
            line:        "$lines",
        }},
      ]),
    ]);

    const total = totalCount[0]?.n || 0;

    // Attach running balance per row (continues from priorSigned)
    let running = priorSigned;
    const entries = rows.map((r) => {
      const dr = r.line.debit_amt  || 0;
      const cr = r.line.credit_amt || 0;
      running = r2(running + dr - cr);
      return {
        je_id:        r.je_id,
        je_no:        r.je_no,
        je_date:      r.je_date,
        je_type:      r.je_type,
        narration:    r.line.narration || r.narration || "",
        source_no:    r.source_no,
        source_type:  r.source_type,
        tender_id:    r.tender_id || "",
        debit:        r2(dr),
        credit:       r2(cr),
        balance:      Math.abs(running),
        balance_type: running === 0 ? "" : (running > 0 ? "Dr" : "Cr"),
      };
    });

    return {
      account: {
        account_code:    account.account_code,
        account_name:    account.account_name,
        account_type:    account.account_type,
        account_subtype: account.account_subtype,
        normal_balance:  account.normal_balance,
      },
      from_date: from,
      to_date:   to,
      opening: {
        balance:      Math.abs(priorSigned),
        balance_type: priorSigned === 0 ? "" : (priorSigned > 0 ? "Dr" : "Cr"),
      },
      entries,
      pagination: {
        page:  pageN,
        limit: limitN,
        total,
        pages: Math.ceil(total / limitN),
      },
    };
  }

  // ── GET /reports/cash-flow?from_date=&to_date= ──────────────────────────────
  //
  // Indirect-method-flavoured cash flow:
  //   Opening Cash + Bank balances
  //   + Operating  : Income − Operating Expense (Direct Cost / Site OH / Admin / Financial)
  //   + Investing  : net Fixed Asset movement (Dr increase = outflow, Cr decrease = inflow)
  //   + Financing  : net Equity + Long-term Liability movement
  //   = Closing Cash + Bank balances
  //
  // We compute Opening/Closing directly from is_bank_cash leaves to avoid drift,
  // then back into Operating/Investing/Financing from JE lines on the relevant
  // account_type buckets — which is the simplest reliable view for a tax-payer
  // construction firm. (Statutory IFRS / Ind AS 7 split is not the goal here.)
  static async cashFlow({ from_date, to_date } = {}) {
    const now    = new Date();
    const fyStr  = getFY(now);
    const from   = from_date ? new Date(from_date) : fyStart(fyStr);
    const to     = to_date   ? new Date(to_date)   : now;
    to.setHours(23, 59, 59, 999);

    // 1. All bank/cash leaves
    const bcAccounts = await AccountTreeModel.find({
      is_deleted:         false,
      is_group:           false,
      is_posting_account: true,
      is_bank_cash:       true,
    })
      .select("account_code account_name opening_balance opening_balance_type")
      .lean();
    const bcCodes = bcAccounts.map((a) => a.account_code);

    // 2. All accounts (for activity classification)
    const allAccounts = await AccountTreeModel.find({
      is_deleted:         false,
      is_group:           false,
      is_posting_account: true,
    })
      .select("account_code account_name account_type account_subtype")
      .lean();
    const accMap = Object.fromEntries(allAccounts.map((a) => [a.account_code, a]));

    // 3. Pre-period and period movements for cash/bank accounts
    const [pre, periodAll] = await Promise.all([
      JournalEntryModel.aggregate([
        { $match: { status: "approved", je_date: { $lt: from } } },
        { $unwind: "$lines" },
        { $match: { "lines.account_code": { $in: bcCodes } } },
        { $group: {
            _id: "$lines.account_code",
            total_debit:  { $sum: "$lines.debit_amt"  },
            total_credit: { $sum: "$lines.credit_amt" },
        }},
      ]),
      aggregateMovements({ from_date: from, to_date: to }),
    ]);
    const preMap = Object.fromEntries(pre.map((r) => [r._id, r]));

    // 4. Opening / Closing cash balances per account
    const cashRows = bcAccounts.map((acc) => {
      const opSigned = signedOpening(acc.opening_balance, acc.opening_balance_type);
      const preMv    = preMap[acc.account_code] || { total_debit: 0, total_credit: 0 };
      const opening  = r2(opSigned + preMv.total_debit - preMv.total_credit);

      const periodMv = periodAll[acc.account_code] || { total_debit: 0, total_credit: 0 };
      const netFlow  = r2(periodMv.total_debit - periodMv.total_credit);
      const closing  = r2(opening + netFlow);

      return {
        account_code: acc.account_code,
        account_name: acc.account_name,
        opening,
        inflow:  periodMv.total_debit,
        outflow: periodMv.total_credit,
        net:     netFlow,
        closing,
      };
    });

    const totalOpening = r2(cashRows.reduce((s, r) => s + r.opening, 0));
    const totalClosing = r2(cashRows.reduce((s, r) => s + r.closing, 0));
    const totalNet     = r2(totalClosing - totalOpening);

    // 5. Classify activities by account_type / account_subtype
    //    Operating  = Income (inflow) − Expense (outflow)
    //    Investing  = Fixed Asset movement (Dr = capex outflow, Cr = sale inflow)
    //    Financing  = Equity + Long-term Liability movement
    //                 (Cr = borrowing/equity raised inflow, Dr = repayment/dividend outflow)
    let opIn = 0, opOut = 0, invIn = 0, invOut = 0, finIn = 0, finOut = 0;
    const opLines = [];
    const invLines = [];
    const finLines = [];

    for (const code of Object.keys(periodAll)) {
      const acc = accMap[code];
      if (!acc) continue;
      const mv = periodAll[code];
      const dr = mv.total_debit;
      const cr = mv.total_credit;
      if (dr === 0 && cr === 0) continue;

      // Operating: Income → cash inflow, Expense → cash outflow
      if (acc.account_type === "Income") {
        const net = r2(cr - dr);  // positive = income
        if (net !== 0) {
          opIn += net;
          opLines.push({ account_code: code, account_name: acc.account_name, kind: "Income", amount: net });
        }
      } else if (acc.account_type === "Expense") {
        const net = r2(dr - cr);  // positive = expense
        if (net !== 0) {
          opOut += net;
          opLines.push({ account_code: code, account_name: acc.account_name, kind: "Expense", amount: -net });
        }
      } else if (acc.account_type === "Asset" && acc.account_subtype === "Fixed Asset") {
        const net = r2(dr - cr);  // Dr = asset bought (outflow); Cr = asset sold (inflow)
        if (net > 0) {
          invOut += net;
          invLines.push({ account_code: code, account_name: acc.account_name, kind: "Capex", amount: -net });
        } else if (net < 0) {
          invIn += -net;
          invLines.push({ account_code: code, account_name: acc.account_name, kind: "Asset Sale", amount: -net });
        }
      } else if (acc.account_type === "Equity") {
        const net = r2(cr - dr);  // Cr = equity infused (inflow); Dr = drawings (outflow)
        if (net > 0) { finIn  += net;  finLines.push({ account_code: code, account_name: acc.account_name, kind: "Equity Infusion", amount: net }); }
        if (net < 0) { finOut += -net; finLines.push({ account_code: code, account_name: acc.account_name, kind: "Drawings",        amount: net }); }
      } else if (acc.account_type === "Liability" && acc.account_subtype === "Long-term Liability") {
        const net = r2(cr - dr);  // Cr = borrowing (inflow); Dr = repayment (outflow)
        if (net > 0) { finIn  += net;  finLines.push({ account_code: code, account_name: acc.account_name, kind: "Borrowing",  amount: net }); }
        if (net < 0) { finOut += -net; finLines.push({ account_code: code, account_name: acc.account_name, kind: "Repayment",  amount: net }); }
      }
    }

    const operatingNet = r2(opIn - opOut);
    const investingNet = r2(invIn - invOut);
    const financingNet = r2(finIn - finOut);
    const activitiesNet = r2(operatingNet + investingNet + financingNet);

    // Working-capital reconciliation: difference between cash net and activity net.
    // Caused by AR/AP/inventory movements that don't pass through Income/Expense
    // (e.g. invoice raised but not paid → expense booked, no cash out yet).
    const workingCapitalChange = r2(totalNet - activitiesNet);

    return {
      from_date: from,
      to_date:   to,
      opening_cash: {
        accounts: cashRows.map((r) => ({ account_code: r.account_code, account_name: r.account_name, balance: r.opening })),
        total:    totalOpening,
      },
      operating: {
        inflow:  r2(opIn),
        outflow: r2(opOut),
        net:     operatingNet,
        lines:   opLines,
      },
      investing: {
        inflow:  r2(invIn),
        outflow: r2(invOut),
        net:     investingNet,
        lines:   invLines,
      },
      financing: {
        inflow:  r2(finIn),
        outflow: r2(finOut),
        net:     financingNet,
        lines:   finLines,
      },
      working_capital_change: workingCapitalChange,
      cash_flow_summary: {
        operating_net:           operatingNet,
        investing_net:           investingNet,
        financing_net:           financingNet,
        working_capital_change:  workingCapitalChange,
        net_change_in_cash:      totalNet,
      },
      closing_cash: {
        accounts: cashRows.map((r) => ({ account_code: r.account_code, account_name: r.account_name, balance: r.closing })),
        total:    totalClosing,
      },
      reconciliation: {
        opening_plus_net: r2(totalOpening + totalNet),
        closing:          totalClosing,
        is_balanced:      r2(totalOpening + totalNet - totalClosing) === 0,
        difference:       r2(totalOpening + totalNet - totalClosing),
      },
    };
  }

  // ── GET /reports/cash-flow-forecast?as_of=&horizon_days=&client_credit_days=&contractor_credit_days= ──
  //
  // Forward-looking liquidity projection (Tier 4.3). Projects expected inflows/
  // outflows over the next N days from committed but unsettled documents:
  //
  //   INFLOWS
  //   - Client bills with balance_due > 0 → expected on bill_date + client_credit_days
  //     (or overdue bucket if already past)
  //   - Scheduled retention releases from RetentionLedger (if scheduled_release_date set)
  //
  //   OUTFLOWS
  //   - Vendor bills with balance_due > 0 → expected on due_date
  //   - Contractor weekly bills with balance_due > 0 → bill_date + contractor_credit_days
  //   - Approved POs not yet billed → expected on purchaseOrder.expectedCompletionDate
  //   - Recurring vouchers → next_run_date within horizon
  //
  // Opening cash = sum of Dr balance on all AccountTree rows where is_bank_cash=true.
  // Buckets: overdue, 0-30, 31-60, 61-90, beyond-horizon.
  static async cashFlowForecast({
    as_of,
    horizon_days = 90,
    client_credit_days = 30,
    contractor_credit_days = 15,
  } = {}) {
    const asOf = as_of ? new Date(as_of) : new Date();
    asOf.setHours(0, 0, 0, 0);
    const horizonDays = Math.min(365, Math.max(7, parseInt(horizon_days, 10) || 90));
    const clientDays  = Math.max(0, parseInt(client_credit_days, 10) || 30);
    const contrDays   = Math.max(0, parseInt(contractor_credit_days, 10) || 15);
    const horizonEnd  = new Date(asOf);
    horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86400000);

    // Bucket assignment — days offset from asOf; negative = overdue
    const bucketOf = (expectedDate) => {
      const diff = daysBetween(expectedDate, asOf);
      if (diff < 0)   return "overdue";
      if (diff <= 30) return "0-30";
      if (diff <= 60) return "31-60";
      if (diff <= 90) return "61-90";
      if (diff <= horizonDays) return "beyond-90";
      return "beyond-horizon";
    };

    // ── 1. Opening cash = Σ Dr balance on bank/cash leaves ────────────────────
    const bcRows = await AccountTreeModel.find({
      is_deleted:   false,
      is_bank_cash: true,
    })
      .select("account_code account_name available_balance available_balance_type")
      .lean();

    const opening_cash = bcRows.reduce((sum, r) => {
      const bal = Number(r.available_balance) || 0;
      return sum + (r.available_balance_type === "Dr" ? bal : -bal);
    }, 0);

    // ── 2. Receivables — ClientBilling with balance_due > 0 ───────────────────
    const arBills = await ClientBillingModel.find({
      balance_due: { $gt: 0 },
      status:      { $in: ["Approved", "Pending"] },
      is_deleted:  { $ne: true },
    })
      .select("bill_no bill_date client_id client_name balance_due")
      .lean();

    const inflow_client_bills = arBills.map((b) => {
      const expected = addDays(b.bill_date, clientDays);
      return {
        source_type: "ClientBilling",
        source_no:   b.bill_no,
        party:       b.client_name,
        party_id:    b.client_id,
        doc_date:    b.bill_date,
        expected_date: expected,
        amount:      r2(b.balance_due),
        bucket:      bucketOf(expected),
      };
    });

    // ── 3. Retention releases (scheduled) — optional, only if model has date ──
    let inflow_retention = [];
    try {
      const RetentionLedgerModel = (
        await import("../retentionledger/retentionledger.model.js")
      ).default;
      const retRows = await RetentionLedgerModel.find({
        status:                 "held",
        retention_type:         "receivable",
        scheduled_release_date: { $ne: null, $lte: horizonEnd },
      })
        .select("doc_no party_name outstanding_amount scheduled_release_date")
        .lean()
        .catch(() => []);
      inflow_retention = (retRows || []).map((r) => ({
        source_type:   "RetentionLedger",
        source_no:     r.doc_no,
        party:         r.party_name,
        doc_date:      r.scheduled_release_date,
        expected_date: r.scheduled_release_date,
        amount:        r2(r.outstanding_amount),
        bucket:        bucketOf(r.scheduled_release_date),
      }));
    } catch (_) { /* module optional */ }

    // ── 4. Payables — PurchaseBill (vendor invoices) ──────────────────────────
    const apBills = await PurchaseBillModel.find({
      balance_due: { $gt: 0 },
      status:      { $in: ["Approved", "Pending"] },
      is_deleted:  { $ne: true },
    })
      .select("bill_no doc_date due_date vendor_id vendor_name balance_due")
      .lean();

    const outflow_vendor_bills = apBills.map((b) => {
      const expected = b.due_date ? new Date(b.due_date) : addDays(b.doc_date, 30);
      return {
        source_type: "PurchaseBill",
        source_no:   b.bill_no,
        party:       b.vendor_name,
        party_id:    b.vendor_id,
        doc_date:    b.doc_date,
        expected_date: expected,
        amount:      r2(b.balance_due),
        bucket:      bucketOf(expected),
      };
    });

    // ── 5. Payables — WeeklyBilling (contractor bills) ────────────────────────
    const wbBills = await WeeklyBillingModel.find({
      balance_due: { $gt: 0 },
      status:      { $in: ["Approved", "Pending"] },
      is_deleted:  { $ne: true },
    })
      .select("bill_no bill_date contractor_id contractor_name balance_due")
      .lean();

    const outflow_contractor_bills = wbBills.map((b) => {
      const expected = addDays(b.bill_date, contrDays);
      return {
        source_type: "WeeklyBilling",
        source_no:   b.bill_no,
        party:       b.contractor_name,
        party_id:    b.contractor_id,
        doc_date:    b.bill_date,
        expected_date: expected,
        amount:      r2(b.balance_due),
        bucket:      bucketOf(expected),
      };
    });

    // ── 6. Payables — Approved POs not yet billed ─────────────────────────────
    // A PO becomes a committed outflow when status = "Purchase Order Issued".
    // Expected date = expectedCompletionDate (service uses purchaseOrder sub-doc).
    let outflow_open_pos = [];
    try {
      const PurchaseReqModel = (
        await import("../../purchase/purchaseorderReqIssue/purchaseReqIssue.model.js")
      ).default;
      const openPOs = await PurchaseReqModel.find({
        status: "Purchase Order Issued",
        "purchaseOrder.progressStatus": { $in: ["Not Started", "In Progress", "On Hold"] },
      })
        .select("requestId selectedVendor purchaseOrder projectId")
        .lean()
        .catch(() => []);
      outflow_open_pos = (openPOs || []).map((p) => {
        const expected = p.purchaseOrder?.expectedCompletionDate
          ? new Date(p.purchaseOrder.expectedCompletionDate)
          : addDays(asOf, 30);
        return {
          source_type: "PurchaseOrder",
          source_no:   p.requestId,
          party:       p.selectedVendor?.vendorName || "",
          party_id:    p.selectedVendor?.vendorId || "",
          doc_date:    p.purchaseOrder?.issueDate || p.purchaseOrder?.startDate || null,
          expected_date: expected,
          amount:      r2(p.purchaseOrder?.approvedAmount || 0),
          bucket:      bucketOf(expected),
        };
      }).filter((x) => x.amount > 0);
    } catch (_) { /* optional */ }

    // ── 7. Recurring vouchers — next_run_date within horizon ──────────────────
    let outflow_recurring = [];
    try {
      const RecurringVoucherModel = (
        await import("../recurringvoucher/recurringvoucher.model.js")
      ).default;
      const recurs = await RecurringVoucherModel.find({
        status:        "active",
        next_run_date: { $gte: asOf, $lte: horizonEnd },
      })
        .select("template_name voucher_type next_run_date template_payload")
        .lean()
        .catch(() => []);
      outflow_recurring = (recurs || []).map((r) => {
        const amt = Number(r.template_payload?.total_amount
                        ?? r.template_payload?.net_amount
                        ?? r.template_payload?.amount
                        ?? 0);
        return {
          source_type:   "RecurringVoucher",
          source_no:     r.template_name || "",
          party:         r.voucher_type || "",
          doc_date:      null,
          expected_date: r.next_run_date,
          amount:        r2(amt),
          bucket:        bucketOf(r.next_run_date),
        };
      }).filter((x) => x.amount > 0);
    } catch (_) { /* optional */ }

    // ── 8. Bucket totals & running projected balance ──────────────────────────
    const BUCKETS = ["overdue", "0-30", "31-60", "61-90", "beyond-90", "beyond-horizon"];
    const bucketTotals = Object.fromEntries(BUCKETS.map((b) => [b, { inflow: 0, outflow: 0, net: 0 }]));

    const inflows  = [...inflow_client_bills, ...inflow_retention];
    const outflows = [...outflow_vendor_bills, ...outflow_contractor_bills, ...outflow_open_pos, ...outflow_recurring];

    for (const row of inflows)  bucketTotals[row.bucket].inflow  = r2(bucketTotals[row.bucket].inflow  + row.amount);
    for (const row of outflows) bucketTotals[row.bucket].outflow = r2(bucketTotals[row.bucket].outflow + row.amount);
    for (const b of BUCKETS)    bucketTotals[b].net = r2(bucketTotals[b].inflow - bucketTotals[b].outflow);

    const total_inflow  = r2(inflows.reduce((s, r) => s + r.amount, 0));
    const total_outflow = r2(outflows.reduce((s, r) => s + r.amount, 0));
    const net_horizon   = r2(total_inflow - total_outflow);
    const projected_closing_cash = r2(opening_cash + net_horizon);

    // Running 30-day projections anchored to bucket order
    const running = [];
    let running_balance = opening_cash;
    for (const b of ["overdue", "0-30", "31-60", "61-90"]) {
      running_balance = r2(running_balance + bucketTotals[b].net);
      running.push({ bucket: b, closing_balance: running_balance });
    }

    return {
      as_of:       asOf,
      horizon_days: horizonDays,
      horizon_end:  horizonEnd,
      params: { client_credit_days: clientDays, contractor_credit_days: contrDays },
      opening_cash: {
        total:    r2(opening_cash),
        accounts: bcRows.map((r) => ({
          account_code: r.account_code,
          account_name: r.account_name,
          balance:      r2((r.available_balance_type === "Dr" ? 1 : -1) * (Number(r.available_balance) || 0)),
        })),
      },
      buckets: bucketTotals,
      running_closing_balance: running,
      projected_closing_cash,
      totals: {
        inflow:  total_inflow,
        outflow: total_outflow,
        net:     net_horizon,
        alert_liquidity_shortfall: projected_closing_cash < 0 || running.some((r) => r.closing_balance < 0),
      },
      inflows:  inflows.sort((a, b) => a.expected_date - b.expected_date),
      outflows: outflows.sort((a, b) => a.expected_date - b.expected_date),
      notes: [
        "Client receipts assume bill_date + client_credit_days (default 30) — override via query param.",
        "Vendor outflows use PurchaseBill.due_date (pre-save: doc_date + credit_days).",
        "Contractor outflows assume bill_date + contractor_credit_days (default 15).",
        "Recurring vouchers read the next_run_date already computed by the recurring-voucher cron.",
        "`overdue` bucket holds items already past their expected date as of `as_of`.",
      ],
    };
  }

  // ── GET /reports/fund-flow?opening_date=&closing_date= ──────────────────────
  //
  // Fund-Flow Statement (Tier 4.9). Compares balance sheet at two dates and
  // classifies every movement as a Source or Use of long-term funds. Unlike
  // Cash Flow (which is cash-only), Fund Flow uses the broader concept of
  // "working capital funds" and surfaces non-cash movements like accruals.
  //
  //   SOURCES
  //   - Net profit for the period (from P&L)
  //   - + Depreciation (add-back non-cash)
  //   - Increase in long-term liabilities (loans taken)
  //   - Increase in equity capital (fresh infusion)
  //   - Sale of fixed assets (decrease in gross FA)
  //   - Decrease in working capital (net)
  //
  //   USES
  //   - Purchase of fixed assets (increase in gross FA)
  //   - Repayment of long-term liabilities
  //   - Reduction in equity (buy-back, drawings)
  //   - Increase in working capital (net)
  //
  // Balances are computed as signed Dr-positive internally then surfaced on
  // the account's natural side (Asset/Expense = Dr+, rest = Cr+).
  static async fundFlow({ opening_date, closing_date } = {}) {
    const now = new Date();
    const fyStr = getFY(closing_date ? new Date(closing_date) : now);
    const opening = opening_date ? new Date(opening_date) : fyStart(fyStr);
    opening.setHours(23, 59, 59, 999);
    const closing = closing_date ? new Date(closing_date) : now;
    closing.setHours(23, 59, 59, 999);
    if (closing <= opening) {
      throw new Error("closing_date must be after opening_date");
    }
    const periodFrom = new Date(opening.getTime() + 1);

    const accounts = await AccountTreeModel.find({
      is_deleted: false,
      is_group: false,
      is_posting_account: true,
    })
      .select("account_code account_name account_type account_subtype opening_balance opening_balance_type")
      .sort({ account_code: 1 })
      .lean();

    // Movements up to opening and up to closing — signed Dr-positive
    const [mvOpening, mvClosing] = await Promise.all([
      aggregateMovements({ to_date: opening }),
      aggregateMovements({ to_date: closing }),
    ]);

    const balanceAt = (acc, mvMap) => {
      const mv = mvMap[acc.account_code] || { total_debit: 0, total_credit: 0 };
      const ob = signedOpening(acc.opening_balance, acc.opening_balance_type);
      return r2(ob + mv.total_debit - mv.total_credit); // Dr-positive
    };

    // Classification helper — returns natural-side amount (positive when account went UP on its own side)
    const naturalDelta = (acc) => {
      const open  = balanceAt(acc, mvOpening);
      const close = balanceAt(acc, mvClosing);
      const delta = r2(close - open);                            // Dr-positive delta
      const natural = ["Asset", "Expense"].includes(acc.account_type) ? delta : -delta;
      return { open, close, delta_signed: delta, delta: r2(natural) };
    };

    // ── P&L for the period → net profit & depreciation ────────────────────────
    const periodMv = await aggregateMovements({ from_date: periodFrom, to_date: closing });
    let periodIncome = 0, periodExpense = 0, periodDepreciation = 0;
    for (const a of accounts) {
      const mv = periodMv[a.account_code];
      if (!mv) continue;
      if (a.account_type === "Income")  periodIncome  += (mv.total_credit - mv.total_debit);
      if (a.account_type === "Expense") {
        const e = mv.total_debit - mv.total_credit;
        periodExpense += e;
        if (a.account_subtype === "Depreciation") periodDepreciation += e;
      }
    }
    const netProfit = r2(periodIncome - periodExpense);

    // ── Classify each non-current, non-P&L account ────────────────────────────
    const sources = [];
    const uses = [];
    let wcCurrentAssetDelta = 0;      // natural-side (+ = CA grew = Use)
    let wcCurrentLiabDelta = 0;       // natural-side (+ = CL grew = Source)

    for (const a of accounts) {
      const { delta, open, close } = naturalDelta(a);
      if (delta === 0) continue;

      const row = {
        account_code: a.account_code,
        account_name: a.account_name,
        account_subtype: a.account_subtype,
        opening_balance: ["Asset", "Expense"].includes(a.account_type) ? r2(open) : r2(-open),
        closing_balance: ["Asset", "Expense"].includes(a.account_type) ? r2(close) : r2(-close),
        movement: delta,
      };

      // Skip P&L accounts — captured via netProfit
      if (["Income", "Expense"].includes(a.account_type)) continue;

      // Current Asset / Current Liability → aggregated later into working capital line
      if (a.account_subtype === "Current Asset") {
        wcCurrentAssetDelta = r2(wcCurrentAssetDelta + delta);
        continue;
      }
      if (a.account_subtype === "Current Liability" || a.account_subtype === "Tax Liability") {
        wcCurrentLiabDelta = r2(wcCurrentLiabDelta + delta);
        continue;
      }

      // Fixed Asset: + = purchase (Use); − = sale (Source)
      if (a.account_subtype === "Fixed Asset" || a.account_subtype === "Contra Asset") {
        if (delta > 0)  uses.push({ ...row, category: "Purchase of Fixed Asset" });
        else            sources.push({ ...row, category: "Sale of Fixed Asset", movement: Math.abs(delta) });
        continue;
      }

      // Long-term Liability: + = loan taken (Source); − = repayment (Use)
      if (a.account_subtype === "Long-term Liability") {
        if (delta > 0)  sources.push({ ...row, category: "Long-term Loan Taken" });
        else            uses.push({ ...row, category: "Long-term Loan Repaid", movement: Math.abs(delta) });
        continue;
      }

      // Equity (Capital / Reserves excluding retained earnings period profit): + = Source; − = Use
      if (a.account_type === "Equity") {
        if (delta > 0)  sources.push({ ...row, category: "Equity / Capital Infusion" });
        else            uses.push({ ...row, category: "Equity Reduction / Drawings", movement: Math.abs(delta) });
        continue;
      }
    }

    // ── Net profit + depreciation add-back → Source ───────────────────────────
    if (netProfit !== 0) {
      sources.unshift({
        account_code: "—",
        account_name: "Funds from Operations (Net Profit)",
        account_subtype: "Retained Earnings",
        opening_balance: 0,
        closing_balance: 0,
        movement: netProfit,
        category: "Funds from Operations",
      });
    }
    if (periodDepreciation !== 0) {
      sources.push({
        account_code: "—",
        account_name: "Add: Depreciation (non-cash)",
        account_subtype: "Depreciation",
        opening_balance: 0,
        closing_balance: 0,
        movement: r2(periodDepreciation),
        category: "Funds from Operations",
      });
    }

    // ── Working Capital reconciliation ────────────────────────────────────────
    // ΔWC = ΔCurrent Assets − ΔCurrent Liabilities
    const deltaWC = r2(wcCurrentAssetDelta - wcCurrentLiabDelta);
    const workingCapital = {
      delta_current_assets:      wcCurrentAssetDelta,
      delta_current_liabilities: wcCurrentLiabDelta,
      delta_working_capital:     deltaWC,                                  // + = WC grew = Use
      classification:            deltaWC > 0 ? "Use" : deltaWC < 0 ? "Source" : "None",
    };
    if (deltaWC > 0) {
      uses.push({
        account_code: "—",
        account_name: "Net Increase in Working Capital",
        account_subtype: "Working Capital",
        opening_balance: 0,
        closing_balance: 0,
        movement: deltaWC,
        category: "Working Capital",
      });
    } else if (deltaWC < 0) {
      sources.push({
        account_code: "—",
        account_name: "Net Decrease in Working Capital",
        account_subtype: "Working Capital",
        opening_balance: 0,
        closing_balance: 0,
        movement: Math.abs(deltaWC),
        category: "Working Capital",
      });
    }

    const totalSources = r2(sources.reduce((s, r) => s + r.movement, 0));
    const totalUses    = r2(uses.reduce((s, r) => s + r.movement, 0));

    return {
      opening_date: opening,
      closing_date: closing,
      financial_year: fyStr,
      funds_from_operations: {
        net_profit: netProfit,
        depreciation_added_back: r2(periodDepreciation),
        total: r2(netProfit + periodDepreciation),
      },
      sources,
      uses,
      working_capital_change: workingCapital,
      totals: {
        total_sources: totalSources,
        total_uses:    totalUses,
        is_balanced:   r2(totalSources - totalUses) === 0,
        difference:    r2(totalSources - totalUses),
      },
      notes: [
        "Current Assets + Current Liabilities are netted into 'Working Capital' movement.",
        "Tax Liability is grouped with Current Liability for working-capital purposes.",
        "Depreciation is added back as a non-cash deduction from net profit.",
        "Any rounding residual lands in `totals.difference` (expect |diff| < 1 ₹).",
      ],
    };
  }

  // ── GET /reports/ratio-analysis?as_of_date= ─────────────────────────────────
  //
  // Ratio Analysis Dashboard (Tier 4.10). Computes the classical management-
  // accounting ratios from Balance Sheet + P&L for an FY ending at `as_of_date`.
  //
  //   LIQUIDITY
  //   - Current Ratio      = CA / CL                  (≥1.5 healthy)
  //   - Quick (Acid-Test)  = (CA − Inventory) / CL    (≥1.0 healthy)
  //   - Cash Ratio         = Cash+Bank / CL
  //
  //   SOLVENCY / LEVERAGE
  //   - Debt-Equity        = Long-term Debt / Equity
  //   - Debt Ratio         = Total Liab / Total Assets
  //   - Interest Coverage  = EBIT / Interest Expense
  //
  //   PROFITABILITY
  //   - Net Profit Margin  = NP / Revenue
  //   - Gross Profit Margin= (Revenue − Direct Cost) / Revenue
  //   - ROCE               = EBIT / Capital Employed  (CE = Equity + LT Debt)
  //   - ROA                = Net Profit / Total Assets
  //
  //   ACTIVITY (Working-capital cycle in days)
  //   - DSO                = AR / Revenue × 365
  //   - DPO                = AP / Purchases × 365
  //   - DIO                = Inventory / Direct Cost × 365
  //   - Cash Conversion    = DSO + DIO − DPO
  static async ratioAnalysis({ as_of_date } = {}) {
    const asOf = as_of_date ? new Date(as_of_date) : new Date();
    asOf.setHours(23, 59, 59, 999);
    const fyStr = getFY(asOf);
    const fyFrom = fyStart(fyStr);

    const accounts = await AccountTreeModel.find({
      is_deleted: false,
      is_group: false,
      is_posting_account: true,
    })
      .select("account_code account_name account_type account_subtype opening_balance opening_balance_type is_bank_cash")
      .lean();

    const [mvAsOf, mvFyPeriod] = await Promise.all([
      aggregateMovements({ to_date: asOf }),
      aggregateMovements({ from_date: fyFrom, to_date: asOf }),
    ]);

    const signedClose = (a) => {
      const mv = mvAsOf[a.account_code] || { total_debit: 0, total_credit: 0 };
      const ob = signedOpening(a.opening_balance, a.opening_balance_type);
      return ob + mv.total_debit - mv.total_credit; // Dr-positive
    };
    // Natural-side (Asset/Expense Dr+; Liab/Equity/Income Cr+)
    const naturalClose = (a) => {
      const s = signedClose(a);
      return ["Asset", "Expense"].includes(a.account_type) ? s : -s;
    };

    // Bucket totals
    let currentAssets = 0, fixedAssets = 0, inventory = 0, cashBank = 0, trade_receivables = 0;
    let currentLiab = 0, longTermLiab = 0, taxLiab = 0, trade_payables = 0;
    let equity = 0;
    for (const a of accounts) {
      const v = naturalClose(a);
      if (!v) continue;
      if (a.account_type === "Asset") {
        if (a.account_subtype === "Fixed Asset" || a.account_subtype === "Contra Asset") fixedAssets += v;
        else currentAssets += v;
        if (a.is_bank_cash) cashBank += v;
        // Receivable accounts live under Current Asset and typically carry "RCV"/"CL-" codes.
        // Heuristic: treat all Current Asset codes whose name contains "receivable"/"debtor"/"client" as trade.
        const n = (a.account_name || "").toLowerCase();
        if (a.account_subtype === "Current Asset" && (n.includes("receivable") || n.includes("debtor") || n.includes("client"))) {
          trade_receivables += v;
        }
        // Crude inventory detection: name contains "stock" or "inventory" or "material"
        if (n.includes("inventory") || n.includes("stock") || n.includes("material")) {
          inventory += v;
        }
      } else if (a.account_type === "Liability") {
        if (a.account_subtype === "Long-term Liability") longTermLiab += v;
        else if (a.account_subtype === "Tax Liability")   taxLiab += v;
        else currentLiab += v;
        const n = (a.account_name || "").toLowerCase();
        if (a.account_subtype === "Current Liability" && (n.includes("payable") || n.includes("creditor") || n.includes("vendor") || n.includes("contractor"))) {
          trade_payables += v;
        }
      } else if (a.account_type === "Equity") {
        equity += v;
      }
    }
    currentLiab += taxLiab; // For ratio purposes

    // P&L numbers for the FY → period
    let revenue = 0, directCost = 0, totalExpense = 0, interestExpense = 0;
    for (const a of accounts) {
      const mv = mvFyPeriod[a.account_code];
      if (!mv) continue;
      if (a.account_type === "Income")  revenue    += (mv.total_credit - mv.total_debit);
      if (a.account_type === "Expense") {
        const e = mv.total_debit - mv.total_credit;
        totalExpense += e;
        if (a.account_subtype === "Direct Cost")       directCost      += e;
        if (a.account_subtype === "Financial Expense") interestExpense += e;
      }
    }
    const netProfit = r2(revenue - totalExpense);
    const ebit      = r2(netProfit + interestExpense);  // no separate Tax line in this COA
    equity         = r2(equity + netProfit);             // include current-period retained earnings

    // Purchases proxy — total Dr movement on Direct Cost accounts for the FY period
    let purchases = 0;
    for (const a of accounts) {
      if (a.account_subtype !== "Direct Cost") continue;
      const mv = mvFyPeriod[a.account_code];
      if (mv) purchases += mv.total_debit;
    }

    const div = (num, den) => (den === 0 ? null : r2(num / den));
    const pct = (num, den) => (den === 0 ? null : r2((num / den) * 100));

    const totalAssets    = r2(currentAssets + fixedAssets);
    const totalLiab      = r2(currentLiab + longTermLiab);
    const capitalEmployed = r2(equity + longTermLiab);

    const liquidity = {
      current_ratio:     div(currentAssets, currentLiab),
      quick_ratio:       div(currentAssets - inventory, currentLiab),
      cash_ratio:        div(cashBank, currentLiab),
    };
    const solvency = {
      debt_to_equity:    div(longTermLiab, equity),
      debt_ratio:        div(totalLiab, totalAssets),
      interest_coverage: div(ebit, interestExpense),
    };
    const profitability = {
      net_profit_margin_pct:   pct(netProfit, revenue),
      gross_profit_margin_pct: pct(revenue - directCost, revenue),
      roce_pct:                pct(ebit, capitalEmployed),
      roa_pct:                 pct(netProfit, totalAssets),
    };
    const activity = {
      dso_days:           div(trade_receivables * 365, revenue),
      dpo_days:           div(trade_payables * 365, purchases),
      dio_days:           div(inventory * 365, directCost),
      cash_conversion_cycle_days: (() => {
        const dso = div(trade_receivables * 365, revenue);
        const dpo = div(trade_payables * 365, purchases);
        const dio = div(inventory * 365, directCost);
        if (dso === null || dpo === null || dio === null) return null;
        return r2(dso + dio - dpo);
      })(),
    };

    return {
      as_of_date: asOf,
      financial_year: fyStr,
      balance_sheet_snapshot: {
        current_assets: r2(currentAssets),
        fixed_assets:   r2(fixedAssets),
        total_assets:   totalAssets,
        current_liabilities: r2(currentLiab),
        long_term_liabilities: r2(longTermLiab),
        total_liabilities: totalLiab,
        equity: equity,
        capital_employed: capitalEmployed,
        inventory: r2(inventory),
        cash_bank: r2(cashBank),
        trade_receivables: r2(trade_receivables),
        trade_payables:    r2(trade_payables),
      },
      pnl_snapshot: {
        revenue:          r2(revenue),
        direct_cost:      r2(directCost),
        total_expense:    r2(totalExpense),
        interest_expense: r2(interestExpense),
        net_profit:       netProfit,
        ebit:             ebit,
      },
      ratios: {
        liquidity,
        solvency,
        profitability,
        activity,
      },
      notes: [
        "Trade receivables/payables are identified by name-match ('receivable','debtor','client' / 'payable','creditor','vendor','contractor') within Current Asset/Liability subtypes.",
        "Inventory is identified by name match ('stock','inventory','material').",
        "EBIT = NP + Interest Expense (no separate Tax line in the COA).",
        "null ratio ⇒ denominator is zero (not enough data yet).",
      ],
    };
  }

  // ── GET /reports/tender-profitability?from_date=&to_date=&tender_id= ────────
  //
  // Tender Profitability with full absorption costing (Tier 4.2).
  //
  //   For each tender:
  //   - Revenue            = Σ Income allocated to tender (JE or line tender_id)
  //   - Direct Cost        = Σ Expense (Direct Cost) on tender
  //   - Site Overhead      = Σ Expense (Site Overhead) on tender
  //   - Direct margin      = Revenue − (Direct + Site OH)
  //   - Indirect allocation= share of company-wide Admin/Financial/Depreciation
  //                         (unallocated JEs) × Revenue share ratio
  //   - Operating profit   = Direct margin − Indirect allocation
  //   - Margin %           = Operating profit / Revenue
  //
  // Absorption base: revenue-weighted for Admin/Financial; asset-direct for
  // Depreciation when the asset's cost-head ties to a tender, else revenue-weighted.
  static async tenderProfitability({ from_date, to_date, tender_id } = {}) {
    const now = new Date();
    const fyStr = getFY(to_date ? new Date(to_date) : now);
    const from = from_date ? new Date(from_date) : fyStart(fyStr);
    const to   = to_date   ? new Date(to_date)   : now;
    to.setHours(23, 59, 59, 999);

    // 1. Chart of accounts → lookup map
    const accounts = await AccountTreeModel.find({
      is_deleted: false, is_group: false, is_posting_account: true,
    })
      .select("account_code account_type account_subtype")
      .lean();
    const acc = Object.fromEntries(accounts.map((a) => [a.account_code, a]));

    // 2. Fetch tenders (filter if specific one requested)
    const tenderQuery = tender_id ? { tender_id } : {};
    const tenders = await TenderModel.find(tenderQuery)
      .select("tender_id tender_name tender_status tender_value agreement_value client_name")
      .lean();
    const tenderMap = Object.fromEntries(tenders.map((t) => [t.tender_id, t]));

    // 3. Single aggregation: by (effective_tender_id, account_code) for the period
    // effective tender = line.tender_id if present, else header tender_id
    const agg = await JournalEntryModel.aggregate([
      { $match: { status: "approved", je_date: { $gte: from, $lte: to } } },
      { $unwind: "$lines" },
      {
        $project: {
          effective_tender: {
            $cond: [
              { $and: [{ $ne: ["$lines.tender_id", null] }, { $ne: ["$lines.tender_id", ""] }] },
              "$lines.tender_id",
              "$tender_id",
            ],
          },
          account_code: "$lines.account_code",
          debit:  "$lines.debit_amt",
          credit: "$lines.credit_amt",
        },
      },
      {
        $group: {
          _id: { tender: "$effective_tender", code: "$account_code" },
          debit:  { $sum: "$debit" },
          credit: { $sum: "$credit" },
        },
      },
    ]);

    // 4. Roll up by tender → { revenue, direct_cost, site_overhead, admin, financial, depreciation }
    const bucket = () => ({ revenue: 0, direct_cost: 0, site_overhead: 0, admin: 0, financial: 0, depreciation: 0, other_expense: 0 });
    const byTender = {};                                      // tender_id -> bucket
    const unallocated = bucket();

    for (const row of agg) {
      const t    = row._id.tender || "";
      const a    = acc[row._id.code];
      if (!a) continue;
      const dr = row.debit, cr = row.credit;

      // Pick or create bucket
      const b = t ? (byTender[t] ||= bucket()) : unallocated;

      if (a.account_type === "Income") {
        b.revenue += (cr - dr);
      } else if (a.account_type === "Expense") {
        const e = (dr - cr);
        switch (a.account_subtype) {
          case "Direct Cost":       b.direct_cost += e; break;
          case "Site Overhead":     b.site_overhead += e; break;
          case "Admin Expense":     b.admin += e; break;
          case "Financial Expense": b.financial += e; break;
          case "Depreciation":      b.depreciation += e; break;
          default:                  b.other_expense += e;
        }
      }
    }

    // 5. Allocation base — revenue share for each tender of total tender revenue
    const totalTenderRevenue = Object.values(byTender).reduce((s, b) => s + b.revenue, 0);
    const totalUnallocatedIndirect = r2(
      unallocated.admin + unallocated.financial + unallocated.depreciation + unallocated.other_expense,
    );

    const rows = [];
    for (const [tid, b] of Object.entries(byTender)) {
      const meta = tenderMap[tid] || {};
      const directMargin = r2(b.revenue - b.direct_cost - b.site_overhead);
      const share = totalTenderRevenue > 0 ? (b.revenue / totalTenderRevenue) : 0;
      const indirectAllocated = r2(totalUnallocatedIndirect * share);
      const absorbedIndirect  = r2(b.admin + b.financial + b.depreciation + b.other_expense + indirectAllocated);
      const operatingProfit   = r2(directMargin - absorbedIndirect);
      const marginPct         = b.revenue > 0 ? r2((operatingProfit / b.revenue) * 100) : null;

      rows.push({
        tender_id:         tid,
        tender_name:       meta.tender_name || "",
        client_name:       meta.client_name || "",
        tender_status:     meta.tender_status || "",
        tender_value:      r2(meta.tender_value || 0),
        agreement_value:   r2(meta.agreement_value || 0),
        revenue:           r2(b.revenue),
        direct_cost:       r2(b.direct_cost),
        site_overhead:     r2(b.site_overhead),
        direct_margin:     directMargin,
        direct_indirect:   r2(b.admin + b.financial + b.depreciation + b.other_expense),
        allocated_indirect: indirectAllocated,
        absorbed_indirect: absorbedIndirect,
        operating_profit:  operatingProfit,
        operating_margin_pct: marginPct,
        revenue_share_pct: r2(share * 100),
      });
    }

    // 6. Sort by operating profit descending
    rows.sort((a, b) => b.operating_profit - a.operating_profit);

    // 7. Company-level totals
    const companyRevenue = r2(rows.reduce((s, r) => s + r.revenue, 0));
    const companyDirect  = r2(rows.reduce((s, r) => s + r.direct_cost + r.site_overhead, 0));
    const companyAbsorbed = r2(rows.reduce((s, r) => s + r.absorbed_indirect, 0));
    const companyOpProfit = r2(rows.reduce((s, r) => s + r.operating_profit, 0));

    return {
      from_date: from,
      to_date:   to,
      financial_year: fyStr,
      tenders: rows,
      unallocated_indirect: {
        admin:          r2(unallocated.admin),
        financial:      r2(unallocated.financial),
        depreciation:   r2(unallocated.depreciation),
        other_expense:  r2(unallocated.other_expense),
        revenue_leak:   r2(unallocated.revenue),   // Income without tender tag (data quality signal)
        total:          totalUnallocatedIndirect,
      },
      company_totals: {
        total_revenue:       companyRevenue,
        total_direct:        companyDirect,
        total_absorbed_indirect: companyAbsorbed,
        total_operating_profit:  companyOpProfit,
        operating_margin_pct:    companyRevenue > 0 ? r2((companyOpProfit / companyRevenue) * 100) : null,
      },
      notes: [
        "Indirect expenses without a tender tag are absorbed into tender P&Ls pro-rata by revenue share.",
        "Depreciation is treated as an indirect cost unless the JE line carries a tender_id.",
        "`revenue_leak` flags Income JEs that weren't tagged to any tender — improve tagging to reduce it.",
      ],
    };
  }

  // ── GET /reports/gstr-1?from_date=&to_date= ─────────────────────────────────
  //
  // Outward supplies (sales) for the period:
  //   - B2B   : ClientBilling rows with client_gstin (when populated)
  //   - B2CL  : Inter-state to unregistered, invoice value > ₹2.5 lakh
  //   - B2CS  : All other unregistered (state + rate slab summary)
  //   - CDNR  : Credit notes against B2B (registered)
  //   - CDNUR : Credit notes against B2C (unregistered)
  //
  // Limitation: ClientBilling does not currently store client_gstin. Until it is
  // added, every invoice falls into B2C buckets. We expose the field anyway so
  // wiring it later requires no service change.
  static async gstr1({ from_date, to_date } = {}) {
    const now    = new Date();
    const fyStr  = getFY(now);
    const from   = from_date ? new Date(from_date) : fyStart(fyStr);
    const to     = to_date   ? new Date(to_date)   : now;
    to.setHours(23, 59, 59, 999);

    // Approved client bills + client credit notes in window
    const [bills, cns] = await Promise.all([
      ClientBillingModel.find({
        status: "Approved",
        bill_date: { $gte: from, $lte: to },
        is_deleted: { $ne: true },
      }).lean(),
      ClientCNModel.find({
        status: "Approved",
        ccn_date: { $gte: from, $lte: to },
        is_deleted: { $ne: true },
      }).lean(),
    ]);

    const b2b = [];   // registered (with client_gstin)
    const b2cl = [];  // unregistered + interstate + > 2.5L
    const b2cs = {};  // grouped by state + rate slab
    const cdnr = [];  // credit notes (registered)
    const cdnur = []; // credit notes (unregistered)

    let outCgst = 0, outSgst = 0, outIgst = 0, outTaxable = 0;

    for (const b of bills) {
      const gstin = b.client_gstin || "";
      const pos   = b.place_of_supply || (b.tax_mode === "otherstate" ? "Others" : "InState");
      const taxable = b.grand_total || 0;
      const cgst = b.cgst_amt || 0;
      const sgst = b.sgst_amt || 0;
      const igst = b.igst_amt || 0;
      const total = r2(taxable + cgst + sgst + igst);

      outTaxable += taxable;
      outCgst    += cgst;
      outSgst    += sgst;
      outIgst    += igst;

      const row = {
        bill_id:   b.bill_id,
        bill_date: b.bill_date,
        client_id: b.client_id,
        client_name: b.client_name,
        client_gstin: gstin,
        client_state: b.client_state || "",
        place_of_supply: pos,
        tax_mode:  b.tax_mode,
        taxable,
        cgst_pct:  b.cgst_pct, cgst_amt: cgst,
        sgst_pct:  b.sgst_pct, sgst_amt: sgst,
        igst_pct:  b.igst_pct, igst_amt: igst,
        invoice_value: total,
      };

      if (gstin) {
        // Registered recipient → B2B regardless of state
        b2b.push(row);
      } else if (pos === "Others" && total > 250000) {
        // Unregistered + interstate + > ₹2.5L → B2CL
        b2cl.push(row);
      } else {
        // All other unregistered → B2CS, grouped by state + rate slab
        const slabKey = `${b.client_state || "_"}|${b.tax_mode}|${b.cgst_pct + b.sgst_pct + b.igst_pct}`;
        if (!b2cs[slabKey]) {
          b2cs[slabKey] = {
            place_of_supply: pos,
            client_state: b.client_state || "",
            tax_mode: b.tax_mode,
            rate_pct: r2(b.cgst_pct + b.sgst_pct + b.igst_pct),
            taxable: 0, cgst: 0, sgst: 0, igst: 0, invoice_count: 0,
          };
        }
        b2cs[slabKey].taxable += taxable;
        b2cs[slabKey].cgst    += cgst;
        b2cs[slabKey].sgst    += sgst;
        b2cs[slabKey].igst    += igst;
        b2cs[slabKey].invoice_count += 1;
      }
    }

    for (const cn of cns) {
      const gstin   = cn.client_gstin || "";
      const taxable = cn.grand_total || 0;
      const cgst = cn.cgst_amt || 0;
      const sgst = cn.sgst_amt || 0;
      const igst = cn.igst_amt || 0;
      // Credit notes reduce output tax
      outTaxable -= taxable;
      outCgst    -= cgst;
      outSgst    -= sgst;
      outIgst    -= igst;

      const row = {
        ccn_no:    cn.ccn_no,
        ccn_date:  cn.ccn_date,
        bill_id:   cn.bill_id,
        client_id: cn.client_id,
        client_name: cn.client_name,
        client_gstin: gstin,
        client_state: cn.client_state || "",
        place_of_supply: cn.place_of_supply || (cn.tax_mode === "otherstate" ? "Others" : "InState"),
        tax_mode:  cn.tax_mode,
        taxable, cgst_amt: cgst, sgst_amt: sgst, igst_amt: igst,
        cn_value:  r2(taxable + cgst + sgst + igst),
        reason:    cn.reason || "",
      };
      // Registered recipient → CDNR; unregistered → CDNUR
      if (gstin) cdnr.push(row); else cdnur.push(row);
    }

    // Round + format b2cs
    const b2csRows = Object.values(b2cs).map((g) => ({
      place_of_supply: g.place_of_supply,
      client_state:    g.client_state,
      tax_mode:        g.tax_mode,
      rate_pct:        g.rate_pct,
      taxable:         r2(g.taxable),
      cgst:            r2(g.cgst),
      sgst:            r2(g.sgst),
      igst:            r2(g.igst),
      invoice_count:   g.invoice_count,
    }));

    return {
      from_date: from,
      to_date:   to,
      b2b:   { rows: b2b,    count: b2b.length },
      b2cl:  { rows: b2cl,   count: b2cl.length },
      b2cs:  { rows: b2csRows, count: b2csRows.length },
      cdnr:  { rows: cdnr,   count: cdnr.length },
      cdnur: { rows: cdnur,  count: cdnur.length },
      summary: {
        total_invoices:    bills.length,
        total_credit_notes: cns.length,
        total_taxable:     r2(outTaxable),
        total_cgst:        r2(outCgst),
        total_sgst:        r2(outSgst),
        total_igst:        r2(outIgst),
        total_output_tax:  r2(outCgst + outSgst + outIgst),
      },
    };
  }

  // ── GET /reports/gstr-2b?from_date=&to_date= ────────────────────────────────
  //
  // Inward supplies (purchases) eligible for ITC during the period:
  //   - PurchaseBill     → vendor invoices
  //   - DebitNote        → if raised_by="Vendor", increases ITC; if "Company", reduces it
  //   - ExpenseVoucher   → direct GST-bearing expenses (petty cash)
  //
  // Output: per-vendor summary + rate-slab summary + grand totals.
  static async gstr2b({ from_date, to_date } = {}) {
    const now    = new Date();
    const fyStr  = getFY(now);
    const from   = from_date ? new Date(from_date) : fyStart(fyStr);
    const to     = to_date   ? new Date(to_date)   : now;
    to.setHours(23, 59, 59, 999);

    const [bills, dns, evs] = await Promise.all([
      PurchaseBillModel.find({
        status: "approved",
        doc_date: { $gte: from, $lte: to },
        is_deleted: { $ne: true },
      }).lean(),
      DebitNoteModel.find({
        status: "approved",
        dn_date: { $gte: from, $lte: to },
        is_deleted: { $ne: true },
      }).lean(),
      ExpenseVoucherModel.find({
        status:  "approved",
        ev_date: { $gte: from, $lte: to },
        is_deleted: { $ne: true },
      }).lean(),
    ]);

    const vendorMap = {};      // gstin → { name, count, taxable, cgst, sgst, igst }
    const slabMap   = {};      // rate% → { taxable, cgst, sgst, igst }
    let totTaxable = 0, totCgst = 0, totSgst = 0, totIgst = 0;

    const addToVendor = (gstin, name, taxable, cgst, sgst, igst) => {
      const key = gstin || `__nogstin__${name}`;
      if (!vendorMap[key]) {
        vendorMap[key] = {
          vendor_gstin: gstin || "",
          vendor_name:  name || "",
          invoice_count: 0,
          taxable: 0, cgst: 0, sgst: 0, igst: 0,
        };
      }
      vendorMap[key].invoice_count += 1;
      vendorMap[key].taxable += taxable;
      vendorMap[key].cgst    += cgst;
      vendorMap[key].sgst    += sgst;
      vendorMap[key].igst    += igst;
    };

    const addToSlab = (ratePct, taxable, cgst, sgst, igst) => {
      const key = String(r2(ratePct));
      if (!slabMap[key]) slabMap[key] = { rate_pct: r2(ratePct), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      slabMap[key].taxable += taxable;
      slabMap[key].cgst    += cgst;
      slabMap[key].sgst    += sgst;
      slabMap[key].igst    += igst;
    };

    // PurchaseBill: use tax_groups for rate-slab accuracy
    for (const b of bills) {
      const taxable = b.grand_total || 0;
      const cgst = b.tax_groups.reduce((s, g) => s + g.cgst_amt, 0);
      const sgst = b.tax_groups.reduce((s, g) => s + g.sgst_amt, 0);
      const igst = b.tax_groups.reduce((s, g) => s + g.igst_amt, 0);

      addToVendor(b.vendor_gstin, b.vendor_name, taxable, cgst, sgst, igst);
      for (const g of b.tax_groups) {
        addToSlab(g.cgst_pct + g.sgst_pct + g.igst_pct, g.taxable, g.cgst_amt, g.sgst_amt, g.igst_amt);
      }
      totTaxable += taxable; totCgst += cgst; totSgst += sgst; totIgst += igst;
    }

    // DebitNote: vendor-raised increases ITC; company-raised reduces it (sign flip)
    for (const dn of dns) {
      const sign = dn.raised_by === "Vendor" ? 1 : -1;
      const taxable = sign * (dn.taxable_amount || 0);
      const cgst = sign * (dn.cgst_amt || 0);
      const sgst = sign * (dn.sgst_amt || 0);
      const igst = sign * (dn.igst_amt || 0);
      addToVendor(dn.supplier_gstin, dn.supplier_name, taxable, cgst, sgst, igst);
      addToSlab(dn.cgst_pct + dn.sgst_pct + dn.igst_pct, taxable, cgst, sgst, igst);
      totTaxable += taxable; totCgst += cgst; totSgst += sgst; totIgst += igst;
    }

    // ExpenseVoucher: only count lines that have GST charged
    for (const ev of evs) {
      let evTaxable = 0, evCgst = 0, evSgst = 0, evIgst = 0;
      for (const l of ev.lines) {
        const c = l.cgst_amt || 0;
        const s = l.sgst_amt || 0;
        const i = l.igst_amt || 0;
        if (c + s + i === 0) continue;     // skip pure non-GST petty cash
        evTaxable += l.amount || 0;
        evCgst    += c;
        evSgst    += s;
        evIgst    += i;
        addToSlab(l.gst_pct || 0, l.amount || 0, c, s, i);
      }
      if (evTaxable + evCgst + evSgst + evIgst > 0) {
        addToVendor("", ev.payee_name || "Expense (no vendor)", evTaxable, evCgst, evSgst, evIgst);
        totTaxable += evTaxable; totCgst += evCgst; totSgst += evSgst; totIgst += evIgst;
      }
    }

    // Round vendor + slab buckets
    const vendors = Object.values(vendorMap).map((v) => ({
      ...v,
      taxable: r2(v.taxable),
      cgst:    r2(v.cgst),
      sgst:    r2(v.sgst),
      igst:    r2(v.igst),
      total_value: r2(v.taxable + v.cgst + v.sgst + v.igst),
    })).sort((a, b) => b.taxable - a.taxable);

    const rate_slabs = Object.values(slabMap).map((g) => ({
      rate_pct: g.rate_pct,
      taxable:  r2(g.taxable),
      cgst:     r2(g.cgst),
      sgst:     r2(g.sgst),
      igst:     r2(g.igst),
    })).sort((a, b) => a.rate_pct - b.rate_pct);

    return {
      from_date: from,
      to_date:   to,
      sources: {
        purchase_bills:    bills.length,
        debit_notes:       dns.length,
        expense_vouchers_with_gst: evs.filter((e) => (e.total_tax || 0) > 0).length,
      },
      vendors:    { rows: vendors,     count: vendors.length },
      rate_slabs: { rows: rate_slabs,  count: rate_slabs.length },
      summary: {
        total_taxable:    r2(totTaxable),
        total_cgst:       r2(totCgst),
        total_sgst:       r2(totSgst),
        total_igst:       r2(totIgst),
        total_input_itc:  r2(totCgst + totSgst + totIgst),
      },
    };
  }

  // ── GET /reports/gstr-3b?from_date=&to_date= ────────────────────────────────
  //
  // Net GST payable summary for the period:
  //   Output GST  (from approved sales — ClientBilling, less ClientCN)
  //   − Input ITC (from approved purchases — PurchaseBill, DN, EV)
  //   − ITC Reversed (from JEs of type "ITC Reversal")
  //   = Net GST payable for the month / quarter
  //
  // Cross-checks: pulls Output from the 2110/2120/2130 ledger movement and
  // Input from the 1080-CGST/SGST/IGST ledger movement so the JE-derived view
  // matches the document-level view.
  static async gstr3b({ from_date, to_date } = {}) {
    const now    = new Date();
    const fyStr  = getFY(now);
    const from   = from_date ? new Date(from_date) : fyStart(fyStr);
    const to     = to_date   ? new Date(to_date)   : now;
    to.setHours(23, 59, 59, 999);

    // Pull GSTR-1 + GSTR-2B for the same window (document-level view)
    const [g1, g2b] = await Promise.all([
      ReportsService.gstr1({ from_date: from, to_date: to }),
      ReportsService.gstr2b({ from_date: from, to_date: to }),
    ]);

    // Ledger view: movement on output and input GST accounts
    const movements = await aggregateMovements({
      from_date: from,
      to_date:   to,
      account_codes: [...GST_OUTPUT_CODES, ...GST_INPUT_CODES],
    });

    const ledgerOutCgst = r2((movements[GL.GST_OUTPUT_CGST]?.total_credit || 0) - (movements[GL.GST_OUTPUT_CGST]?.total_debit || 0));
    const ledgerOutSgst = r2((movements[GL.GST_OUTPUT_SGST]?.total_credit || 0) - (movements[GL.GST_OUTPUT_SGST]?.total_debit || 0));
    const ledgerOutIgst = r2((movements[GL.GST_OUTPUT_IGST]?.total_credit || 0) - (movements[GL.GST_OUTPUT_IGST]?.total_debit || 0));

    const ledgerInCgst  = r2((movements[GL.GST_INPUT_CGST]?.total_debit || 0) - (movements[GL.GST_INPUT_CGST]?.total_credit || 0));
    const ledgerInSgst  = r2((movements[GL.GST_INPUT_SGST]?.total_debit || 0) - (movements[GL.GST_INPUT_SGST]?.total_credit || 0));
    const ledgerInIgst  = r2((movements[GL.GST_INPUT_IGST]?.total_debit || 0) - (movements[GL.GST_INPUT_IGST]?.total_credit || 0));

    // ITC reversed in the period (Cr on Input ITC accounts via JE type "ITC Reversal")
    const reversed = await JournalEntryModel.aggregate([
      { $match: {
          status:  "approved",
          je_type: "ITC Reversal",
          je_date: { $gte: from, $lte: to },
      }},
      { $unwind: "$lines" },
      { $match: { "lines.account_code": { $in: GST_INPUT_CODES } } },
      { $group: {
          _id: "$lines.account_code",
          reversed_cr: { $sum: "$lines.credit_amt" },
          reversed_dr: { $sum: "$lines.debit_amt"  },
      }},
    ]);
    const revMap = Object.fromEntries(reversed.map((r) => [r._id, r2((r.reversed_cr || 0) - (r.reversed_dr || 0))]));

    const itcReversedCgst = r2(revMap["1080-CGST"] || 0);
    const itcReversedSgst = r2(revMap["1080-SGST"] || 0);
    const itcReversedIgst = r2(revMap["1080-IGST"] || 0);
    const itcReversedTotal = r2(itcReversedCgst + itcReversedSgst + itcReversedIgst);

    // Net ITC available = Input − Reversed
    const netItcCgst = r2(g2b.summary.total_cgst - itcReversedCgst);
    const netItcSgst = r2(g2b.summary.total_sgst - itcReversedSgst);
    const netItcIgst = r2(g2b.summary.total_igst - itcReversedIgst);

    // Net payable = Output − Net ITC (per head — IGST can offset CGST/SGST in real life,
    // but we keep the per-head split here so the user sees the gross position)
    const netPayCgst = r2(g1.summary.total_cgst - netItcCgst);
    const netPaySgst = r2(g1.summary.total_sgst - netItcSgst);
    const netPayIgst = r2(g1.summary.total_igst - netItcIgst);

    return {
      from_date: from,
      to_date:   to,
      output_supplies: {
        from_documents: {
          taxable: g1.summary.total_taxable,
          cgst:    g1.summary.total_cgst,
          sgst:    g1.summary.total_sgst,
          igst:    g1.summary.total_igst,
        },
        from_ledger: {
          cgst: ledgerOutCgst,
          sgst: ledgerOutSgst,
          igst: ledgerOutIgst,
        },
      },
      input_itc: {
        from_documents: {
          taxable: g2b.summary.total_taxable,
          cgst:    g2b.summary.total_cgst,
          sgst:    g2b.summary.total_sgst,
          igst:    g2b.summary.total_igst,
        },
        from_ledger: {
          cgst: ledgerInCgst,
          sgst: ledgerInSgst,
          igst: ledgerInIgst,
        },
      },
      itc_reversed: {
        cgst:  itcReversedCgst,
        sgst:  itcReversedSgst,
        igst:  itcReversedIgst,
        total: itcReversedTotal,
      },
      net_itc_available: {
        cgst:  netItcCgst,
        sgst:  netItcSgst,
        igst:  netItcIgst,
        total: r2(netItcCgst + netItcSgst + netItcIgst),
      },
      net_gst_payable: {
        cgst:  netPayCgst,
        sgst:  netPaySgst,
        igst:  netPayIgst,
        total: r2(netPayCgst + netPaySgst + netPayIgst),
      },
      reconciliation: {
        // Document view should match ledger view to the rupee.
        // Drift here means a JE was posted to an output/input GST account WITHOUT
        // a corresponding sales / purchase document — investigate via General Ledger.
        output_match:
          r2(g1.summary.total_cgst - ledgerOutCgst) === 0 &&
          r2(g1.summary.total_sgst - ledgerOutSgst) === 0 &&
          r2(g1.summary.total_igst - ledgerOutIgst) === 0,
        input_match:
          r2(g2b.summary.total_cgst - ledgerInCgst) === 0 &&
          r2(g2b.summary.total_sgst - ledgerInSgst) === 0 &&
          r2(g2b.summary.total_igst - ledgerInIgst) === 0,
      },
    };
  }

  // ── GET /reports/itc-reversal?from_date=&to_date= ───────────────────────────
  //
  // Lists every approved JE with je_type="ITC Reversal" in the window,
  // showing which input GST account was reduced and by how much.
  static async itcReversalRegister({ from_date, to_date } = {}) {
    const now    = new Date();
    const fyStr  = getFY(now);
    const from   = from_date ? new Date(from_date) : fyStart(fyStr);
    const to     = to_date   ? new Date(to_date)   : now;
    to.setHours(23, 59, 59, 999);

    const jes = await JournalEntryModel.find({
      status:  "approved",
      je_type: "ITC Reversal",
      je_date: { $gte: from, $lte: to },
    })
      .sort({ je_date: 1, createdAt: 1 })
      .lean();

    let totCgst = 0, totSgst = 0, totIgst = 0;
    const rows = jes.map((je) => {
      // Sum Cr on each input GST account on this JE
      let cgst = 0, sgst = 0, igst = 0;
      for (const l of je.lines) {
        if (l.account_code === "1080-CGST") cgst += (l.credit_amt || 0) - (l.debit_amt || 0);
        if (l.account_code === "1080-SGST") sgst += (l.credit_amt || 0) - (l.debit_amt || 0);
        if (l.account_code === "1080-IGST") igst += (l.credit_amt || 0) - (l.debit_amt || 0);
      }
      cgst = r2(cgst); sgst = r2(sgst); igst = r2(igst);
      totCgst += cgst; totSgst += sgst; totIgst += igst;
      return {
        je_no:     je.je_no,
        je_date:   je.je_date,
        narration: je.narration,
        tender_id: je.tender_id || "",
        cgst, sgst, igst,
        total: r2(cgst + sgst + igst),
      };
    });

    return {
      from_date: from,
      to_date:   to,
      rows,
      count: rows.length,
      totals: {
        cgst:  r2(totCgst),
        sgst:  r2(totSgst),
        igst:  r2(totIgst),
        total: r2(totCgst + totSgst + totIgst),
      },
    };
  }

  // ── GET /reports/tds-register?from_date=&to_date=&section= ──────────────────
  //
  // Section-wise TDS deducted (PaymentVoucher + ExpenseVoucher) grouped by
  // deductee + month — formatted for 26Q / 27Q quarterly return preparation.
  static async tdsRegister({ from_date, to_date, section } = {}) {
    const now    = new Date();
    const fyStr  = getFY(now);
    const from   = from_date ? new Date(from_date) : fyStart(fyStr);
    const to     = to_date   ? new Date(to_date)   : now;
    to.setHours(23, 59, 59, 999);

    const pvFilter = {
      status:  "approved",
      pv_date: { $gte: from, $lte: to },
      tds_amt: { $gt: 0 },
    };
    const evFilter = {
      status:  "approved",
      ev_date: { $gte: from, $lte: to },
      tds_amt: { $gt: 0 },
    };
    if (section) {
      pvFilter.tds_section = section;
      evFilter.tds_section = section;
    }

    const [pvs, evs] = await Promise.all([
      PaymentVoucherModel.find(pvFilter).lean(),
      ExpenseVoucherModel.find(evFilter).lean(),
    ]);

    // ── Pass 1: build raw rows (PAN deferred) ──────────────────────────────────
    const rows = [];

    for (const pv of pvs) {
      rows.push({
        source:        "PaymentVoucher",
        voucher_no:    pv.pv_no,
        payment_date:  pv.pv_date,
        deductee_type: pv.supplier_type,
        deductee_id:   pv.supplier_id,
        deductee_name: pv.supplier_name,
        deductee_pan:  "",                    // filled in pass 2
        deductee_gstin: pv.supplier_gstin || "",
        tds_section:   pv.tds_section || "",
        tds_pct:       pv.tds_pct || 0,
        gross_amount:  r2(pv.gross_amount || 0),
        tds_amount:    r2(pv.tds_amt || 0),
        net_paid:      r2(pv.amount || 0),
        tender_id:     pv.tender_id || "",
      });
    }

    for (const ev of evs) {
      rows.push({
        source:        "ExpenseVoucher",
        voucher_no:    ev.ev_no,
        payment_date:  ev.ev_date,
        deductee_type: ev.payee_type,
        deductee_id:   ev.employee_id || "",
        deductee_name: ev.payee_name || "",
        deductee_pan:  "",                    // filled in pass 2
        deductee_gstin: "",
        tds_section:   ev.tds_section || "",
        tds_pct:       ev.tds_pct || 0,
        gross_amount:  r2(ev.gross_total || 0),
        tds_amount:    r2(ev.tds_amt || 0),
        net_paid:      r2(ev.net_paid || 0),
        tender_id:     ev.tender_id || "",
      });
    }

    // ── Pass 2: bulk-fetch PAN for unique deductees, enrich rows ──────────────
    const idsByType = { Vendor: new Set(), Contractor: new Set(), Client: new Set(), Employee: new Set() };
    for (const r of rows) {
      if (!r.deductee_id) continue;
      // PV supplier_type is "Vendor"/"Contractor"/"Client".
      // EV payee_type is "Employee"/"External"/"Other"; only Employee maps to a master.
      if (idsByType[r.deductee_type]) idsByType[r.deductee_type].add(r.deductee_id);
    }

    const [vendors, contractors, clients, employees] = await Promise.all([
      idsByType.Vendor.size
        ? VendorModel.find({ vendor_id: { $in: [...idsByType.Vendor] } }).select("vendor_id pan_no").lean()
        : [],
      idsByType.Contractor.size
        ? ContractorModel.find({ contractor_id: { $in: [...idsByType.Contractor] } }).select("contractor_id pan_number").lean()
        : [],
      idsByType.Client.size
        ? ClientModel.find({ client_id: { $in: [...idsByType.Client] } }).select("client_id pan_no").lean()
        : [],
      idsByType.Employee.size
        ? EmployeeModel.find({ employeeId: { $in: [...idsByType.Employee] } }).select("employeeId payroll.panNumber").lean()
        : [],
    ]);

    const panMap = {};
    for (const v of vendors)     panMap[`Vendor|${v.vendor_id}`]         = v.pan_no || "";
    for (const c of contractors) panMap[`Contractor|${c.contractor_id}`] = c.pan_number || "";
    for (const c of clients)     panMap[`Client|${c.client_id}`]         = c.pan_no || "";
    for (const e of employees)   panMap[`Employee|${e.employeeId}`]      = e.payroll?.panNumber || "";

    for (const r of rows) {
      r.deductee_pan = panMap[`${r.deductee_type}|${r.deductee_id}`] || "";
    }

    // ── Pass 3: aggregate by section / deductee / month ────────────────────────
    const sectionMap  = {};
    const deducteeMap = {};
    const monthMap    = {};

    const monthKey = (d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    };

    for (const entry of rows) {
      const sk = entry.tds_section;
      if (!sectionMap[sk]) sectionMap[sk] = { section: sk, count: 0, gross: 0, tds: 0 };
      sectionMap[sk].count += 1;
      sectionMap[sk].gross += entry.gross_amount;
      sectionMap[sk].tds   += entry.tds_amount;

      const dk = `${sk}|${entry.deductee_id || entry.deductee_name}`;
      if (!deducteeMap[dk]) deducteeMap[dk] = {
        section:        sk,
        deductee_type:  entry.deductee_type,
        deductee_id:    entry.deductee_id,
        deductee_name:  entry.deductee_name,
        deductee_pan:   entry.deductee_pan || "",
        count: 0, gross: 0, tds: 0,
      };
      deducteeMap[dk].count += 1;
      deducteeMap[dk].gross += entry.gross_amount;
      deducteeMap[dk].tds   += entry.tds_amount;

      const mk = monthKey(entry.payment_date);
      if (!monthMap[mk]) monthMap[mk] = { month: mk, count: 0, gross: 0, tds: 0 };
      monthMap[mk].count += 1;
      monthMap[mk].gross += entry.gross_amount;
      monthMap[mk].tds   += entry.tds_amount;
    }

    // TDS payable account ledger movement (cross-check)
    const tdsLedger = await aggregateMovements({
      from_date: from,
      to_date:   to,
      account_codes: [TDS_PAYABLE_CODE],
    });
    const ledgerCredited = r2(
      (tdsLedger[TDS_PAYABLE_CODE]?.total_credit || 0) -
      (tdsLedger[TDS_PAYABLE_CODE]?.total_debit  || 0)
    );

    const totalTds   = r2(rows.reduce((s, r) => s + r.tds_amount,   0));
    const totalGross = r2(rows.reduce((s, r) => s + r.gross_amount, 0));

    const round = (m) => Object.values(m).map((g) => ({
      ...g,
      gross: r2(g.gross),
      tds:   r2(g.tds),
    }));

    return {
      from_date: from,
      to_date:   to,
      filter:    { section: section || null },
      rows,
      summary: {
        total_entries:   rows.length,
        total_gross:     totalGross,
        total_tds:       totalTds,
        ledger_credit:   ledgerCredited,
        is_reconciled:   r2(totalTds - ledgerCredited) === 0,
        ledger_diff:     r2(totalTds - ledgerCredited),
      },
      by_section:  round(sectionMap).sort((a, b) => a.section.localeCompare(b.section)),
      by_deductee: round(deducteeMap).sort((a, b) => b.tds - a.tds),
      by_month:    round(monthMap).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  // ── GET /reports/ar-aging?as_of=&tender_id=&client_id= ─────────────────────
  //
  // Accounts Receivable aging — what clients owe Romaa, bucketed by overdue days.
  //
  // Buckets (relative to as_of):
  //   not_due  : due_date >= as_of (or no due_date and bill within 0 days)
  //   d_0_30   : 1–30 days overdue
  //   d_31_60  : 31–60 days overdue
  //   d_61_90  : 61–90 days overdue
  //   d_90_plus: 91+ days overdue
  //
  // Source: ClientBilling status="Approved" with balance_due > 0. Bills use
  // bill_date as the due reference (ClientBilling has no due_date field today).
  static async arAging({ as_of, tender_id, client_id } = {}) {
    const asOf = as_of ? new Date(as_of) : new Date();
    asOf.setHours(23, 59, 59, 999);

    const filter = { status: "Approved", balance_due: { $gt: 0 } };
    if (tender_id) filter.tender_id = tender_id;
    if (client_id) filter.client_id = client_id;

    const bills = await ClientBillingModel.find(filter)
      .select("bill_id bill_date client_id client_name tender_id tender_name net_amount amount_received balance_due")
      .lean();

    const buckets = ["not_due", "d_0_30", "d_31_60", "d_61_90", "d_90_plus"];
    const empty = () => Object.fromEntries(buckets.map(b => [b, 0]));
    const partyMap = {};       // client_id → { client_name, total, ...buckets }
    const totals   = empty();
    let grandTotal = 0;
    const rows = [];

    for (const b of bills) {
      const refDate = new Date(b.bill_date);
      const days = Math.floor((asOf - refDate) / 86400000);
      let bucket;
      if (days <= 0)      bucket = "not_due";
      else if (days <= 30) bucket = "d_0_30";
      else if (days <= 60) bucket = "d_31_60";
      else if (days <= 90) bucket = "d_61_90";
      else                 bucket = "d_90_plus";

      const amt = r2(b.balance_due || 0);
      totals[bucket] += amt;
      grandTotal     += amt;

      const key = b.client_id || "__nokey__";
      if (!partyMap[key]) {
        partyMap[key] = {
          client_id:   b.client_id   || "",
          client_name: b.client_name || "",
          total: 0,
          ...empty(),
        };
      }
      partyMap[key].total          += amt;
      partyMap[key][bucket]        += amt;

      rows.push({
        bill_id:        b.bill_id,
        bill_date:      b.bill_date,
        client_id:      b.client_id,
        client_name:    b.client_name,
        tender_id:      b.tender_id,
        tender_name:    b.tender_name,
        net_amount:     r2(b.net_amount || 0),
        amount_received: r2(b.amount_received || 0),
        balance_due:    amt,
        days_overdue:   Math.max(0, days),
        bucket,
      });
    }

    const roundBuckets = (o) => Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])
    );

    return {
      as_of:      asOf,
      filter:     { tender_id: tender_id || null, client_id: client_id || null },
      buckets:    roundBuckets(totals),
      grand_total: r2(grandTotal),
      by_client:  Object.values(partyMap)
        .map(roundBuckets)
        .sort((a, b) => b.total - a.total),
      rows:       rows.sort((a, b) => b.days_overdue - a.days_overdue),
      summary: {
        bill_count:  rows.length,
        client_count: Object.keys(partyMap).length,
      },
    };
  }

  // ── GET /reports/ap-aging?as_of=&tender_id=&vendor_id=&contractor_id= ──────
  //
  // Accounts Payable aging — what Romaa owes vendors + contractors.
  // Source: PurchaseBill status="approved" + WeeklyBilling status="Approved",
  //         each with balance_due > 0.
  //
  // PurchaseBill has a real due_date (doc_date + credit_days). WeeklyBilling
  // does not, so falls back to bill_date.
  static async apAging({ as_of, tender_id, vendor_id, contractor_id } = {}) {
    const asOf = as_of ? new Date(as_of) : new Date();
    asOf.setHours(23, 59, 59, 999);

    const pbFilter = { status: "approved", balance_due: { $gt: 0 } };
    if (tender_id) pbFilter.tender_id = tender_id;
    if (vendor_id) pbFilter.vendor_id = vendor_id;

    const wbFilter = { status: "Approved", balance_due: { $gt: 0 } };
    if (tender_id)     wbFilter.tender_id     = tender_id;
    if (contractor_id) wbFilter.contractor_id = contractor_id;

    // If user filtered to a specific vendor, skip contractor source entirely (and vice versa)
    const [pbills, wbills] = await Promise.all([
      contractor_id
        ? []
        : PurchaseBillModel.find(pbFilter)
            .select("doc_id doc_date due_date vendor_id vendor_name tender_id tender_name net_amount amount_paid balance_due")
            .lean(),
      vendor_id
        ? []
        : WeeklyBillingModel.find(wbFilter)
            .select("bill_no bill_date contractor_id contractor_name tender_id total_amount net_payable amount_paid balance_due")
            .lean(),
    ]);

    const buckets = ["not_due", "d_0_30", "d_31_60", "d_61_90", "d_90_plus"];
    const empty = () => Object.fromEntries(buckets.map(b => [b, 0]));
    const partyMap = {};       // "Vendor|VND-001" / "Contractor|CTR-001" → aggregate
    const totals   = empty();
    let grandTotal = 0;
    const rows = [];

    const bucketise = (days) => {
      if (days <= 0)       return "not_due";
      if (days <= 30)      return "d_0_30";
      if (days <= 60)      return "d_31_60";
      if (days <= 90)      return "d_61_90";
      return "d_90_plus";
    };

    for (const b of pbills) {
      const refDate = new Date(b.due_date || b.doc_date);
      const days = Math.floor((asOf - refDate) / 86400000);
      const bucket = bucketise(days);
      const amt = r2(b.balance_due || 0);
      totals[bucket] += amt;
      grandTotal     += amt;

      const key = `Vendor|${b.vendor_id || "__nokey__"}`;
      if (!partyMap[key]) {
        partyMap[key] = {
          party_type: "Vendor", party_id: b.vendor_id || "", party_name: b.vendor_name || "",
          total: 0, ...empty(),
        };
      }
      partyMap[key].total += amt;
      partyMap[key][bucket] += amt;

      rows.push({
        source:        "PurchaseBill",
        bill_id:       b.doc_id,
        bill_date:     b.doc_date,
        due_date:      b.due_date || b.doc_date,
        party_type:    "Vendor",
        party_id:      b.vendor_id,
        party_name:    b.vendor_name,
        tender_id:     b.tender_id,
        tender_name:   b.tender_name,
        net_amount:    r2(b.net_amount || 0),
        amount_paid:   r2(b.amount_paid || 0),
        balance_due:   amt,
        days_overdue:  Math.max(0, days),
        bucket,
      });
    }

    for (const b of wbills) {
      const refDate = new Date(b.bill_date);
      const days = Math.floor((asOf - refDate) / 86400000);
      const bucket = bucketise(days);
      const amt = r2(b.balance_due || 0);
      totals[bucket] += amt;
      grandTotal     += amt;

      const key = `Contractor|${b.contractor_id || "__nokey__"}`;
      if (!partyMap[key]) {
        partyMap[key] = {
          party_type: "Contractor", party_id: b.contractor_id || "", party_name: b.contractor_name || "",
          total: 0, ...empty(),
        };
      }
      partyMap[key].total += amt;
      partyMap[key][bucket] += amt;

      rows.push({
        source:        "WeeklyBilling",
        bill_id:       b.bill_no,
        bill_date:     b.bill_date,
        due_date:      b.bill_date,
        party_type:    "Contractor",
        party_id:      b.contractor_id,
        party_name:    b.contractor_name,
        tender_id:     b.tender_id,
        tender_name:   "",
        net_amount:    r2(b.net_payable || b.total_amount || 0),
        amount_paid:   r2(b.amount_paid || 0),
        balance_due:   amt,
        days_overdue:  Math.max(0, days),
        bucket,
      });
    }

    const roundBuckets = (o) => Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])
    );

    return {
      as_of:       asOf,
      filter:      { tender_id: tender_id || null, vendor_id: vendor_id || null, contractor_id: contractor_id || null },
      buckets:     roundBuckets(totals),
      grand_total: r2(grandTotal),
      by_party:    Object.values(partyMap)
        .map(roundBuckets)
        .sort((a, b) => b.total - a.total),
      rows:        rows.sort((a, b) => b.days_overdue - a.days_overdue),
      summary: {
        bill_count:        rows.length,
        vendor_count:      Object.keys(partyMap).filter(k => k.startsWith("Vendor|")).length,
        contractor_count:  Object.keys(partyMap).filter(k => k.startsWith("Contractor|")).length,
      },
    };
  }

  // ── GET /reports/form-26q?financial_year=&quarter=&tan=&deductor_name= ─────
  //
  // Form 26Q — quarterly TDS statement for payments OTHER than salary.
  // Salary TDS (section 192) is filed via Form 24Q and is excluded here.
  //
  // Output is structured to be ready for RPU (Return Preparation Utility) import
  // OR for CSV export to tools like Saral/Genius. Challan detail fields are
  // surfaced but left blank — they're entered on the TDS portal at payment time
  // and are not tracked inside Romaa_BE today.
  //
  // Quarter calendar (FY-aligned):
  //   Q1: Apr–Jun   Q2: Jul–Sep   Q3: Oct–Dec   Q4: Jan–Mar
  //
  // Due date for filing 26Q:
  //   Q1: 31 Jul    Q2: 31 Oct    Q3: 31 Jan    Q4: 31 May
  static async form26Q({ financial_year, quarter, tan, deductor_name, deductor_pan, deductor_address }) {
    if (!financial_year) throw new Error("financial_year is required (e.g. '25-26')");
    if (!quarter)        throw new Error("quarter is required (Q1|Q2|Q3|Q4)");
    if (!["Q1", "Q2", "Q3", "Q4"].includes(quarter)) {
      throw new Error("quarter must be one of Q1, Q2, Q3, Q4");
    }

    // Resolve quarter date range (FY-aligned)
    const fyStartYear = 2000 + parseInt(financial_year.split("-")[0], 10);
    const QMAP = {
      Q1: { fromM: 3,  toM: 5,  fromY: fyStartYear,     toY: fyStartYear,     dueDate: `${fyStartYear}-07-31`     },
      Q2: { fromM: 6,  toM: 8,  fromY: fyStartYear,     toY: fyStartYear,     dueDate: `${fyStartYear}-10-31`     },
      Q3: { fromM: 9,  toM: 11, fromY: fyStartYear,     toY: fyStartYear,     dueDate: `${fyStartYear + 1}-01-31` },
      Q4: { fromM: 0,  toM: 2,  fromY: fyStartYear + 1, toY: fyStartYear + 1, dueDate: `${fyStartYear + 1}-05-31` },
    };
    const q = QMAP[quarter];
    const from = new Date(q.fromY, q.fromM, 1, 0, 0, 0, 0);
    const to   = new Date(q.toY,   q.toM + 1, 0, 23, 59, 59, 999);   // last day of last month

    // Reuse tdsRegister — returns enriched rows with PAN
    const register = await ReportsService.tdsRegister({ from_date: from, to_date: to });

    // Exclude section 192 (salary — goes to 24Q)
    const rows = (register.rows || []).filter(r => r.tds_section && r.tds_section !== "192");

    // Build deductee-level records (one entry per payment)
    const deducteeRecords = rows.map((r, idx) => ({
      sl_no:              idx + 1,
      deductee_code:      r.deductee_type === "Vendor"     ? "02"      // company vendor (best-effort default)
                         : r.deductee_type === "Contractor" ? "02"
                         : r.deductee_type === "Client"     ? "02"
                         : "01",                                        // individual
      pan:                r.deductee_pan || "PANNOTAVBL",
      deductee_name:      r.deductee_name || "",
      section_code:       r.tds_section,
      payment_date:       r.payment_date,
      amount_paid:        r.gross_amount,
      tds_amount:         r.tds_amount,
      tds_rate_pct:       r.tds_pct,
      surcharge:          0,                    // not tracked separately
      education_cess:     0,                    // not tracked separately
      total_tax_deducted: r.tds_amount,
      total_tax_deposited: 0,                   // challan-side — blank until challan booked
      bsr_code:           "",                   // challan detail
      challan_date:       "",                   // challan detail
      challan_serial_no:  "",                   // challan detail
      book_entry_flag:    "N",
      voucher_no:         r.voucher_no,
      deductee_type:      r.deductee_type,
      deductee_id:        r.deductee_id,
      tender_id:          r.tender_id || "",
    }));

    // Group per deductee × section (collapsed view — useful for challan reconciliation)
    const collapsedMap = {};
    for (const d of deducteeRecords) {
      const k = `${d.section_code}|${d.pan || d.deductee_name}`;
      if (!collapsedMap[k]) {
        collapsedMap[k] = {
          section_code:  d.section_code,
          pan:           d.pan,
          deductee_name: d.deductee_name,
          deductee_type: d.deductee_type,
          entry_count:   0,
          total_paid:    0,
          total_tds:     0,
        };
      }
      collapsedMap[k].entry_count += 1;
      collapsedMap[k].total_paid  += d.amount_paid;
      collapsedMap[k].total_tds   += d.tds_amount;
    }
    const byDeductee = Object.values(collapsedMap)
      .map(d => ({ ...d, total_paid: r2(d.total_paid), total_tds: r2(d.total_tds) }))
      .sort((a, b) => b.total_tds - a.total_tds);

    // Section-level totals (header challan summary)
    const sectionMap = {};
    for (const d of deducteeRecords) {
      const sk = d.section_code;
      if (!sectionMap[sk]) sectionMap[sk] = { section_code: sk, entry_count: 0, total_paid: 0, total_tds: 0 };
      sectionMap[sk].entry_count += 1;
      sectionMap[sk].total_paid  += d.amount_paid;
      sectionMap[sk].total_tds   += d.tds_amount;
    }
    const bySection = Object.values(sectionMap)
      .map(s => ({ ...s, total_paid: r2(s.total_paid), total_tds: r2(s.total_tds) }))
      .sort((a, b) => a.section_code.localeCompare(b.section_code));

    // PAN-missing audit (critical for 26Q — any entry without PAN attracts 20% TDS)
    const missingPan = deducteeRecords.filter(d => !d.pan || d.pan === "PANNOTAVBL");

    const totalPaid = r2(deducteeRecords.reduce((s, d) => s + d.amount_paid, 0));
    const totalTds  = r2(deducteeRecords.reduce((s, d) => s + d.tds_amount,  0));

    return {
      form:              "26Q",
      financial_year,
      quarter,
      period:            { from, to },
      due_date:          q.dueDate,
      deductor: {
        tan:          tan || "",
        name:         deductor_name || "",
        pan:          deductor_pan || "",
        address:      deductor_address || "",
      },
      summary: {
        total_entries:   deducteeRecords.length,
        total_paid:      totalPaid,
        total_tds:       totalTds,
        pan_missing:     missingPan.length,
        sections_count:  bySection.length,
        deductees_count: byDeductee.length,
      },
      by_section:        bySection,
      by_deductee:       byDeductee,
      deductee_records:  deducteeRecords,
      pan_missing_rows:  missingPan,
      notes: [
        "Excludes TDS under section 192 (salary) — that is filed via Form 24Q.",
        "Challan fields (BSR, date, serial) are not tracked in Romaa; fill at TDS portal before upload.",
        "Deductee code 01=Individual, 02=Company/others. Review per deductee before filing.",
        "PAN-missing entries attract TDS @ 20% u/s 206AA — fix those before filing.",
      ],
    };
  }

  // ── GET /reports/form-24q ─────────────────────────────────────────────────
  //
  // Form 24Q — quarterly TDS statement for SALARY (section 192).
  //
  // Source data:
  //   PayrollModel.deductions.tax  — TDS deducted from employee salary
  //   PayrollModel.earnings.grossPay — gross salary paid in the month
  //   Employee.payroll.panNumber    — deductee PAN
  //
  // Output structure mirrors Form 26Q:
  //   - Annexure I (every quarter): per-deductee challan-wise breakup
  //   - Annexure II (Q4 only):       annual salary breakup per employee
  //
  // Challan fields (BSR/date/serial) are not tracked in Romaa today and are
  // surfaced as blank — fill in at the TDS portal before upload.
  static async form24Q({
    financial_year, quarter, tan,
    deductor_name, deductor_pan, deductor_address,
  }) {
    if (!financial_year) throw new Error("financial_year is required (e.g. '25-26')");
    if (!quarter)        throw new Error("quarter is required (Q1|Q2|Q3|Q4)");

    const { from, to, dueDate } = tdsQuarterRange(financial_year, quarter);

    // Fetch payroll rows in the quarter window (month/year stored as integers)
    const months = [];
    for (let d = new Date(from); d <= to; d.setMonth(d.getMonth() + 1)) {
      months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }
    const monthFilter = { $or: months };

    const payrolls = await PayrollModel.find(monthFilter)
      .populate({
        path: "employeeId",
        select: "employeeId name email phone designation payroll dateOfJoining",
      })
      .lean();

    // Build deductee records (one row per payroll month with TDS > 0)
    const deducteeRecords = payrolls
      .filter(p => (p.deductions?.tax || 0) > 0)
      .map((p, idx) => {
        const emp = p.employeeId || {};
        return {
          sl_no:                idx + 1,
          deductee_code:        "01", // 01 = individual (always for salary)
          pan:                  emp.payroll?.panNumber || "PANNOTAVBL",
          deductee_name:        emp.name || "",
          emp_id:               emp.employeeId || "",
          designation:          emp.designation || "",
          section_code:         "192",
          payment_month:        `${p.year}-${String(p.month).padStart(2, "0")}`,
          payment_date:         p.paymentDate || null,
          gross_salary:         r2(p.earnings?.grossPay || 0),
          tds_amount:           r2(p.deductions?.tax || 0),
          tds_rate_pct:         (p.earnings?.grossPay > 0)
                                  ? r2((p.deductions?.tax || 0) / p.earnings.grossPay * 100)
                                  : 0,
          surcharge:            0,
          education_cess:       0,
          total_tax_deducted:   r2(p.deductions?.tax || 0),
          total_tax_deposited:  r2(p.deductions?.tax || 0),
          // Challan fields — not tracked, blank for portal entry
          bsr_code:             "",
          challan_date:         "",
          challan_serial_no:    "",
          book_entry_flag:      "N",
          payroll_id:           p._id,
        };
      });

    // Per-employee summary (one row per deductee)
    const empMap = {};
    for (const d of deducteeRecords) {
      const k = d.pan + "|" + d.emp_id;
      if (!empMap[k]) {
        empMap[k] = {
          pan:           d.pan,
          deductee_code: d.deductee_code,
          emp_id:        d.emp_id,
          name:          d.deductee_name,
          designation:   d.designation,
          months_count:  0,
          total_paid:    0,
          total_tds:     0,
        };
      }
      empMap[k].months_count += 1;
      empMap[k].total_paid   += d.gross_salary;
      empMap[k].total_tds    += d.tds_amount;
    }
    const byEmployee = Object.values(empMap)
      .map(e => ({ ...e, total_paid: r2(e.total_paid), total_tds: r2(e.total_tds) }))
      .sort((a, b) => b.total_tds - a.total_tds);

    // Annexure II — annual salary breakup (Q4 ONLY)
    let annexureII = null;
    if (quarter === "Q4") {
      const fyMonths = [];
      const startYY = 2000 + parseInt(financial_year.split("-")[0], 10);
      // Apr (start year) through Mar (start year + 1)
      for (let m = 4; m <= 12; m++) fyMonths.push({ month: m, year: startYY });
      for (let m = 1; m <= 3;  m++) fyMonths.push({ month: m, year: startYY + 1 });

      const fyPayrolls = await PayrollModel.find({ $or: fyMonths })
        .populate({ path: "employeeId", select: "employeeId name designation payroll dateOfJoining" })
        .lean();

      const annualMap = {};
      for (const p of fyPayrolls) {
        const emp = p.employeeId || {};
        const k   = (emp.payroll?.panNumber || "PANNOTAVBL") + "|" + (emp.employeeId || "");
        if (!annualMap[k]) {
          annualMap[k] = {
            pan:                emp.payroll?.panNumber || "PANNOTAVBL",
            emp_id:             emp.employeeId || "",
            name:               emp.name || "",
            designation:        emp.designation || "",
            date_of_joining:    emp.dateOfJoining || null,
            gross_salary:       0,
            basic:              0,
            hra:                0,
            da:                 0,
            other_allowances:   0,
            pf:                 0,
            esi:                0,
            tds:                0,
            // Old-regime / chapter VI-A — not tracked in Romaa, surface as 0
            sec_80c:            0,
            sec_80d:            0,
            taxable_income:     0,
          };
        }
        annualMap[k].gross_salary    += (p.earnings?.grossPay        || 0);
        annualMap[k].basic           += (p.earnings?.basic           || 0);
        annualMap[k].hra             += (p.earnings?.hra             || 0);
        annualMap[k].da              += (p.earnings?.da              || 0);
        annualMap[k].other_allowances+= (p.earnings?.otherAllowances || 0)
                                       + (p.earnings?.overtimePay    || 0);
        annualMap[k].pf              += (p.deductions?.pf            || 0);
        annualMap[k].esi             += (p.deductions?.esi           || 0);
        annualMap[k].tds             += (p.deductions?.tax           || 0);
      }
      annexureII = Object.values(annualMap).map(e => ({
        ...e,
        gross_salary:     r2(e.gross_salary),
        basic:            r2(e.basic),
        hra:              r2(e.hra),
        da:               r2(e.da),
        other_allowances: r2(e.other_allowances),
        pf:               r2(e.pf),
        esi:              r2(e.esi),
        tds:              r2(e.tds),
        // Best-effort taxable income = gross − PF − ESI (no investment data)
        taxable_income:   r2(Math.max(0, e.gross_salary - e.pf - e.esi)),
      })).sort((a, b) => b.gross_salary - a.gross_salary);
    }

    const totalPaid = r2(deducteeRecords.reduce((s, d) => s + d.gross_salary, 0));
    const totalTds  = r2(deducteeRecords.reduce((s, d) => s + d.tds_amount,    0));
    const missingPan = deducteeRecords.filter(d => !d.pan || d.pan === "PANNOTAVBL");

    return {
      form:            "24Q",
      financial_year,
      quarter,
      period:          { from, to },
      due_date:        dueDate,
      deductor: {
        tan:           tan || "",
        name:          deductor_name || "",
        pan:           deductor_pan || "",
        address:       deductor_address || "",
      },
      summary: {
        total_entries:    deducteeRecords.length,
        total_paid:       totalPaid,
        total_tds:        totalTds,
        pan_missing:      missingPan.length,
        deductees_count:  byEmployee.length,
        has_annexure_ii:  quarter === "Q4",
      },
      by_employee:       byEmployee,
      deductee_records:  deducteeRecords,
      pan_missing_rows:  missingPan,
      annexure_ii:       annexureII,
      notes: [
        "Section 192 (salary) only — non-salary TDS is filed via Form 26Q.",
        "Challan fields (BSR, date, serial) are not tracked in Romaa; fill at TDS portal.",
        "Annexure II (annual salary statement) is only required for Q4.",
        "PAN-missing entries attract TDS @ 20% u/s 206AA — fix before filing.",
        "Romaa does not capture old/new regime selection or 80C/80D investments — adjust at filing time.",
      ],
    };
  }

  // ── GET /reports/form-16 ──────────────────────────────────────────────────
  //
  // Form 16 — annual TDS certificate for SALARY (section 192).
  // One certificate per employee per FY. If employee_id is omitted, returns
  // certificates for ALL employees with TDS > 0 in the FY.
  //
  // Part A: quarter-wise TDS deducted (challan summary) — derived from PayrollModel
  // Part B: salary breakup, deductions, taxable income — best-effort from Payroll
  static async form16({ financial_year, employee_id, tan, deductor_name, deductor_pan, deductor_address }) {
    if (!financial_year) throw new Error("financial_year is required (e.g. '25-26')");

    const startYY = 2000 + parseInt(financial_year.split("-")[0], 10);
    const fyMonths = [];
    for (let m = 4; m <= 12; m++) fyMonths.push({ month: m, year: startYY });
    for (let m = 1; m <= 3;  m++) fyMonths.push({ month: m, year: startYY + 1 });

    const filter = { $or: fyMonths };
    if (employee_id) filter.employeeId = employee_id;

    const payrolls = await PayrollModel.find(filter)
      .populate({
        path: "employeeId",
        select: "employeeId name email phone designation address payroll dateOfJoining",
      })
      .lean();

    // Group by employee, then by quarter
    const empMap = {};
    for (const p of payrolls) {
      const emp = p.employeeId || {};
      const empKey = String(emp._id || p.employeeId);
      if (!empMap[empKey]) {
        empMap[empKey] = {
          employee: {
            _id:             emp._id,
            emp_id:          emp.employeeId || "",
            name:            emp.name || "",
            email:           emp.email || "",
            phone:           emp.phone || "",
            designation:     emp.designation || "",
            pan:             emp.payroll?.panNumber || "PANNOTAVBL",
            uan:             emp.payroll?.uanNumber || "",
            address:         emp.address || {},
            date_of_joining: emp.dateOfJoining || null,
          },
          // Part A — quarterly TDS
          part_a: { Q1: { paid: 0, tds: 0, months: 0 },
                    Q2: { paid: 0, tds: 0, months: 0 },
                    Q3: { paid: 0, tds: 0, months: 0 },
                    Q4: { paid: 0, tds: 0, months: 0 } },
          // Part B — annual salary breakup
          part_b: {
            gross_salary:        0,
            basic:               0,
            hra:                 0,
            da:                  0,
            other_allowances:    0,
            // Section 16 standard deductions (best-effort)
            std_deduction:       50000, // FY 24-25+ default
            professional_tax:    0,
            pf_employee:         0,
            esi_employee:        0,
            tds:                 0,
            // Chapter VI-A — Romaa does not capture investments
            sec_80c:             0,
            sec_80d:             0,
            sec_80g:             0,
          },
          months_count: 0,
        };
      }

      const e = empMap[empKey];
      const q = (p.month >= 4 && p.month <= 6)  ? "Q1"
              : (p.month >= 7 && p.month <= 9)  ? "Q2"
              : (p.month >= 10 && p.month <= 12)? "Q3" : "Q4";

      e.part_a[q].paid += (p.earnings?.grossPay || 0);
      e.part_a[q].tds  += (p.deductions?.tax    || 0);
      e.part_a[q].months += 1;

      e.part_b.gross_salary    += (p.earnings?.grossPay        || 0);
      e.part_b.basic           += (p.earnings?.basic           || 0);
      e.part_b.hra             += (p.earnings?.hra             || 0);
      e.part_b.da              += (p.earnings?.da              || 0);
      e.part_b.other_allowances+= (p.earnings?.otherAllowances || 0)
                                + (p.earnings?.overtimePay     || 0);
      e.part_b.pf_employee     += (p.deductions?.pf            || 0);
      e.part_b.esi_employee    += (p.deductions?.esi           || 0);
      e.part_b.tds             += (p.deductions?.tax           || 0);
      e.months_count           += 1;
    }

    // Round + compute taxable income
    const certificates = Object.values(empMap).map(e => {
      ["Q1", "Q2", "Q3", "Q4"].forEach(q => {
        e.part_a[q].paid = r2(e.part_a[q].paid);
        e.part_a[q].tds  = r2(e.part_a[q].tds);
      });
      const b = e.part_b;
      Object.keys(b).forEach(k => { if (typeof b[k] === "number") b[k] = r2(b[k]); });

      const total_deductions = b.std_deduction + b.professional_tax + b.pf_employee + b.esi_employee
                              + b.sec_80c + b.sec_80d + b.sec_80g;
      const taxable_income   = r2(Math.max(0, b.gross_salary - total_deductions));
      const total_tds_year   = r2(["Q1","Q2","Q3","Q4"].reduce((s, q) => s + e.part_a[q].tds, 0));
      const total_paid_year  = r2(["Q1","Q2","Q3","Q4"].reduce((s, q) => s + e.part_a[q].paid, 0));

      return {
        employee:        e.employee,
        period:          { financial_year, from: `${startYY}-04-01`, to: `${startYY + 1}-03-31` },
        deductor: {
          tan:     tan || "",
          name:    deductor_name || "",
          pan:     deductor_pan || "",
          address: deductor_address || "",
        },
        part_a: {
          quarters:         e.part_a,
          total_paid_year,
          total_tds_year,
        },
        part_b: {
          ...b,
          total_deductions: r2(total_deductions),
          taxable_income,
        },
        months_count:     e.months_count,
      };
    }).filter(c => c.part_a.total_tds_year > 0 || employee_id) // include zero-TDS only if explicitly requested
      .sort((a, b) => b.part_a.total_tds_year - a.part_a.total_tds_year);

    return {
      form:            "16",
      financial_year,
      certificates_count: certificates.length,
      certificates,
      notes: [
        "Issued annually per employee — issue by 15 June following the FY (Income Tax Rule 31).",
        "Part A challan / token data is not tracked in Romaa; populate via TRACES portal export.",
        "Part B Chapter VI-A figures (80C/80D/80G) are zero — Romaa does not capture investments.",
        "Standard deduction defaults to ₹50,000 — adjust per regime (old/new) before issuing.",
      ],
    };
  }

  // ── GET /reports/form-16a ─────────────────────────────────────────────────
  //
  // Form 16A — quarterly TDS certificate for NON-SALARY (sections 194C/194I/etc.).
  // One certificate per (deductee × section × quarter). Surfaces directly from
  // the existing tdsRegister (Form 26Q data) grouped by deductee + section.
  //
  // Filters:
  //   financial_year, quarter — required
  //   deductee_id             — optional (specific vendor/contractor/client)
  //   section                 — optional (e.g. "194C", "194I")
  static async form16A({ financial_year, quarter, deductee_id, section, tan, deductor_name, deductor_pan, deductor_address }) {
    if (!financial_year) throw new Error("financial_year is required (e.g. '25-26')");
    if (!quarter)        throw new Error("quarter is required (Q1|Q2|Q3|Q4)");

    const { from, to, dueDate } = tdsQuarterRange(financial_year, quarter);

    // Pull TDS register for the quarter
    const register = await ReportsService.tdsRegister({ from_date: from, to_date: to });
    let rows = (register.rows || []).filter(r => r.tds_section && r.tds_section !== "192");
    if (deductee_id) rows = rows.filter(r => r.deductee_id === deductee_id);
    if (section)     rows = rows.filter(r => r.tds_section === section);

    // Group by (deductee, section)
    const certMap = {};
    for (const r of rows) {
      const k = `${r.deductee_id}|${r.tds_section}`;
      if (!certMap[k]) {
        certMap[k] = {
          deductee: {
            type:  r.deductee_type,
            id:    r.deductee_id,
            name:  r.deductee_name,
            pan:   r.pan || "PANNOTAVBL",
            gstin: r.gstin || "",
          },
          section_code: r.tds_section,
          period:       { financial_year, quarter, from, to },
          due_date:     dueDate,
          deductor: {
            tan:     tan || "",
            name:    deductor_name || "",
            pan:     deductor_pan || "",
            address: deductor_address || "",
          },
          // Per-payment breakdown
          payments: [],
          total_paid: 0,
          total_tds:  0,
        };
      }
      certMap[k].payments.push({
        payment_date: r.payment_date,
        voucher_no:   r.voucher_no,
        amount_paid:  r.amount_paid,
        tds_rate_pct: r.tds_pct,
        tds_amount:   r.tds_amount,
        // Challan fields — not tracked
        bsr_code:          "",
        challan_date:      "",
        challan_serial_no: "",
        book_entry_flag:   "N",
      });
      certMap[k].total_paid += r.amount_paid;
      certMap[k].total_tds  += r.tds_amount;
    }

    const certificates = Object.values(certMap).map(c => ({
      ...c,
      total_paid: r2(c.total_paid),
      total_tds:  r2(c.total_tds),
    })).sort((a, b) => b.total_tds - a.total_tds);

    return {
      form:               "16A",
      financial_year,
      quarter,
      period:             { from, to },
      due_date:           dueDate,
      certificates_count: certificates.length,
      total_paid:         r2(certificates.reduce((s, c) => s + c.total_paid, 0)),
      total_tds:          r2(certificates.reduce((s, c) => s + c.total_tds, 0)),
      certificates,
      notes: [
        "Issue within 15 days of the 26Q quarterly return due date (i.e. Q1: 15 Aug, Q2: 15 Nov, Q3: 15 Feb, Q4: 15 Jun).",
        "One certificate per deductee per section per quarter.",
        "Challan / TRACES UIN must be filled before final issuance.",
        "PAN-missing entries attract TDS @ 20% u/s 206AA — fix before filing 26Q.",
      ],
    };
  }

  // ── Audit Trail Report (Companies Act 2013 Rule 11(g) compliance) ─────────
  //
  // Chronological log of every financial event captured in the system. Built
  // off JournalEntry as the universal source of truth — each approved JE is
  // a posted GL movement with a created_by + approved_by audit trail and a
  // source_ref/source_type linking back to the originating document
  // (PurchaseBill, PV, RV, ExpenseVoucher, RetentionRelease, etc.).
  //
  // Event types surfaced:
  //   "created"   — JE saved (any status)
  //   "approved"  — JE approved + posted to ledger
  //   "reversed"  — this JE is a reversal of another (is_reversal=true)
  //   "auto_reversed" — original JE marked as auto-reversed (accrual unwind)
  //
  // Filters:
  //   from_date, to_date  — by event timestamp
  //   doc_type            — JE source_type ("PaymentVoucher", "PurchaseBill", etc.)
  //   je_type             — Adjustment, Depreciation, Reversal, ...
  //   user_id             — created_by OR approved_by
  //   source_no           — exact match on source document number (e.g. "PV/25-26/0001")
  //   je_no               — exact match on JE number
  //   tender_id
  //
  // Pagination: page / limit (default 50, max 200).
  static async auditTrail({
    from_date, to_date, doc_type, je_type,
    user_id, source_no, je_no, tender_id,
    page = 1, limit = 50,
  } = {}) {
    const q = {};
    if (doc_type)   q.source_type   = doc_type;
    if (je_type)    q.je_type       = je_type;
    if (source_no)  q.source_no     = source_no;
    if (je_no)      q.je_no         = je_no;
    if (tender_id)  q.tender_id     = tender_id;

    if (user_id) {
      q.$or = [{ created_by: user_id }, { approved_by: user_id }];
    }

    if (from_date || to_date) {
      // Use createdAt for "events" — captures both creation and approval timeline
      // (more accurate than je_date which can be back-dated).
      q.createdAt = {};
      if (from_date) q.createdAt.$gte = new Date(from_date);
      if (to_date) {
        const to = new Date(to_date);
        to.setHours(23, 59, 59, 999);
        q.createdAt.$lte = to;
      }
    }

    const p   = Math.max(1, parseInt(page)  || 1);
    const lim = Math.max(1, Math.min(200, parseInt(limit) || 50));
    const skip = (p - 1) * lim;

    const [docs, total] = await Promise.all([
      JournalEntryModel.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .populate({ path: "created_by",  select: "first_name last_name emp_id email" })
        .populate({ path: "approved_by", select: "first_name last_name emp_id email" })
        .lean(),
      JournalEntryModel.countDocuments(q),
    ]);

    const fmtUser = (u) => u
      ? { id: u._id, name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.emp_id || u.email || String(u._id), emp_id: u.emp_id || "" }
      : null;

    // Each JE produces 1-2 events: creation + (if approved) approval
    const events = [];
    for (const d of docs) {
      const base = {
        je_id:           d._id,
        je_no:           d.je_no,
        je_date:         d.je_date,
        je_type:         d.je_type,
        narration:       d.narration,
        total_debit:     r2(d.total_debit  || 0),
        total_credit:    r2(d.total_credit || 0),
        lines_count:     (d.lines || []).length,
        tender_id:       d.tender_id || "",
        tender_name:     d.tender_name || "",
        source_type:     d.source_type || "",
        source_no:       d.source_no || "",
        source_ref:      d.source_ref || null,
        is_reversal:     !!d.is_reversal,
        reversal_of_no:  d.reversal_of_no || "",
        created_by:      fmtUser(d.created_by),
        approved_by:     fmtUser(d.approved_by),
      };

      events.push({
        ...base,
        timestamp:  d.createdAt,
        event_type: d.is_reversal ? "reversed" : "created",
      });
      if (d.status === "approved" && d.approved_at) {
        events.push({
          ...base,
          timestamp:  d.approved_at,
          event_type: "approved",
        });
      }
      if (d.auto_reversed) {
        events.push({
          ...base,
          timestamp:  d.updatedAt,
          event_type: "auto_reversed",
        });
      }
    }

    // Re-sort events chronologically (mixed creation+approval timestamps)
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Summary counters
    const eventsByType = events.reduce((m, e) => ((m[e.event_type] = (m[e.event_type] || 0) + 1), m), {});
    const userSet     = new Set();
    const docSet      = new Set();
    for (const e of events) {
      if (e.created_by?.id)  userSet.add(String(e.created_by.id));
      if (e.approved_by?.id) userSet.add(String(e.approved_by.id));
      docSet.add(e.je_no);
    }

    return {
      filter: { from_date: from_date || null, to_date: to_date || null,
                doc_type: doc_type || null, je_type: je_type || null,
                user_id: user_id || null, source_no: source_no || null,
                je_no: je_no || null, tender_id: tender_id || null },
      pagination: { page: p, limit: lim, total, pages: Math.ceil(total / lim) },
      summary: {
        total_journal_entries: total,
        events_in_page:        events.length,
        events_by_type:        eventsByType,
        unique_users_in_page:  userSet.size,
        unique_journals_in_page: docSet.size,
      },
      events,
    };
  }

  // ── Audit trail for a single document ─────────────────────────────────────
  //
  // Returns every JE (and reversals) tied to a single source document,
  // identified by either:
  //   - source_type + source_ref (preferred, ObjectId)
  //   - source_type + source_no  (fallback, e.g. "PV/25-26/0001")
  //
  // Includes the JE's created_by/approved_by, plus any reversing JE that
  // points at it (reversal_of = original._id).
  static async auditTrailForDocument({ source_type, source_ref, source_no }) {
    if (!source_type) throw new Error("source_type is required");
    if (!source_ref && !source_no) throw new Error("source_ref or source_no is required");

    const q = { source_type };
    if (source_ref) q.source_ref = source_ref;
    if (source_no)  q.source_no  = source_no;

    // Originating JE(s)
    const originals = await JournalEntryModel.find(q)
      .sort({ createdAt: 1 })
      .populate({ path: "created_by",  select: "first_name last_name emp_id email" })
      .populate({ path: "approved_by", select: "first_name last_name emp_id email" })
      .lean();

    // Reversal JEs that point at any of the originals
    const originalIds = originals.map(o => o._id);
    const reversals = originalIds.length
      ? await JournalEntryModel.find({ reversal_of: { $in: originalIds } })
          .sort({ createdAt: 1 })
          .populate({ path: "created_by",  select: "first_name last_name emp_id email" })
          .populate({ path: "approved_by", select: "first_name last_name emp_id email" })
          .lean()
      : [];

    const fmtUser = (u) => u
      ? { id: u._id, name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.emp_id || u.email || String(u._id), emp_id: u.emp_id || "" }
      : null;

    const fmtJE = (d) => ({
      je_id:           d._id,
      je_no:           d.je_no,
      je_date:         d.je_date,
      je_type:         d.je_type,
      status:          d.status,
      narration:       d.narration,
      is_reversal:     !!d.is_reversal,
      reversal_of_no:  d.reversal_of_no || "",
      reversal_of:     d.reversal_of || null,
      total_debit:     r2(d.total_debit || 0),
      total_credit:    r2(d.total_credit || 0),
      lines:           (d.lines || []).map(l => ({
        account_code: l.account_code,
        account_name: l.account_name,
        dr_cr:        l.dr_cr,
        debit_amt:    r2(l.debit_amt || 0),
        credit_amt:   r2(l.credit_amt || 0),
        narration:    l.narration || "",
      })),
      created_by:    fmtUser(d.created_by),
      approved_by:   fmtUser(d.approved_by),
      created_at:    d.createdAt,
      approved_at:   d.approved_at || null,
      auto_reversed: !!d.auto_reversed,
    });

    // Build chronological event timeline
    const events = [];
    for (const d of originals) {
      events.push({ timestamp: d.createdAt, event_type: "created", je: fmtJE(d) });
      if (d.status === "approved" && d.approved_at) {
        events.push({ timestamp: d.approved_at, event_type: "approved", je: fmtJE(d) });
      }
    }
    for (const d of reversals) {
      events.push({ timestamp: d.createdAt, event_type: "reversal_created", je: fmtJE(d) });
      if (d.status === "approved" && d.approved_at) {
        events.push({ timestamp: d.approved_at, event_type: "reversal_approved", je: fmtJE(d) });
      }
    }
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return {
      document: {
        source_type,
        source_ref: source_ref || (originals[0]?.source_ref ?? null),
        source_no:  source_no  || (originals[0]?.source_no  ?? ""),
      },
      summary: {
        original_je_count: originals.length,
        reversal_je_count: reversals.length,
        is_reversed:       reversals.length > 0,
        net_debit:  r2(originals.reduce((s, o) => s + (o.total_debit  || 0), 0) - reversals.reduce((s, r) => s + (r.total_debit  || 0), 0)),
        net_credit: r2(originals.reduce((s, o) => s + (o.total_credit || 0), 0) - reversals.reduce((s, r) => s + (r.total_credit || 0), 0)),
      },
      originals: originals.map(fmtJE),
      reversals: reversals.map(fmtJE),
      events,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /reports/gstr-9?financial_year=25-26
  // ──────────────────────────────────────────────────────────────────────────
  // GSTR-9 — Annual GST Return. Rolls up the full FY (Apr-Mar) of GSTR-1
  // (outward), GSTR-2B (inward ITC), and GSTR-3B (net payable) into the
  // table-wise structure required by the GSTN portal.
  //
  // Tables produced:
  //   Table 4  — Outward supplies on which tax IS payable (B2B/B2CL/B2CS/CDNR/CDNUR)
  //   Table 5  — Outward supplies on which tax is NOT payable (zero-rated/exempt/non-GST)
  //   Table 6  — ITC availed during the FY (split: Inputs / Capital Goods / Input Services / RCM)
  //   Table 7  — ITC reversed and ineligible
  //   Table 8  — Other ITC info (matching with GSTR-2A/2B + ITC lapsed)
  //   Table 9  — Tax paid / payable (per head: CGST/SGST/IGST/Cess + interest + late fee)
  //   Table 17 — HSN-wise outward supplies
  //   Table 18 — HSN-wise inward supplies (eligible ITC)
  //
  // NOT produced (out-of-scope or system doesn't track):
  //   Tables 10-13 — Particulars of prior FY transactions declared in current FY
  //   Table 14    — Differential tax paid on amendments
  //   Table 15    — Demands and refunds
  //   Table 16    — Composition / deemed supplies / goods sent on approval
  //   Table 19    — Late fee payable / paid
  //
  // CAVEAT: GSTR-9 should ALWAYS be filed using values reconciled with the
  // GSTN portal (via the firm's CA). This report is a working draft only.
  // ══════════════════════════════════════════════════════════════════════════
  static async gstr9({ financial_year } = {}) {
    if (!financial_year) throw new Error("financial_year is required (e.g. '25-26')");
    if (!/^\d{2}-\d{2}$/.test(financial_year)) {
      throw new Error(`Invalid financial_year '${financial_year}' — expected YY-YY (e.g. '25-26')`);
    }

    const from = fyStart(financial_year);
    const to   = new Date(from.getFullYear() + 1, 2, 31, 23, 59, 59, 999); // 31-Mar of FY-end

    // Reuse existing computations
    const [g1, g2b, g3b] = await Promise.all([
      ReportsService.gstr1 ({ from_date: from, to_date: to }),
      ReportsService.gstr2b({ from_date: from, to_date: to }),
      ReportsService.gstr3b({ from_date: from, to_date: to }),
    ]);

    // ── Table 4: Outward taxable supplies ────────────────────────────────
    const table4 = {
      A_b2c:  { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 }, // B2CS + B2CL combined
      B_b2b:  { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      C_zero_rated_export_with_payment: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      D_sez_with_payment:               { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      E_deemed_export:                  { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      F_advances_received:              { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      G_inward_rcm:                     { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      H_subtotal:   { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      I_credit_notes_issued: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      J_debit_notes_issued:  { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      K_amendments_added:    { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      L_amendments_reduced:  { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      N_supplies_on_which_tax_payable: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
    };

    // B2B (registered)
    for (const r of (g1.b2b?.rows || [])) {
      table4.B_b2b.taxable += r.taxable; table4.B_b2b.cgst += r.cgst_amt;
      table4.B_b2b.sgst    += r.sgst_amt; table4.B_b2b.igst += r.igst_amt;
    }
    // B2CL + B2CS → A_b2c
    for (const r of (g1.b2cl?.rows || [])) {
      table4.A_b2c.taxable += r.taxable; table4.A_b2c.cgst += r.cgst_amt;
      table4.A_b2c.sgst    += r.sgst_amt; table4.A_b2c.igst += r.igst_amt;
    }
    for (const r of (g1.b2cs?.rows || [])) {
      table4.A_b2c.taxable += r.taxable; table4.A_b2c.cgst += r.cgst;
      table4.A_b2c.sgst    += r.sgst;    table4.A_b2c.igst += r.igst;
    }
    // Credit notes (CDNR + CDNUR) → I
    for (const r of [...(g1.cdnr?.rows || []), ...(g1.cdnur?.rows || [])]) {
      table4.I_credit_notes_issued.taxable += r.taxable;
      table4.I_credit_notes_issued.cgst    += r.cgst_amt;
      table4.I_credit_notes_issued.sgst    += r.sgst_amt;
      table4.I_credit_notes_issued.igst    += r.igst_amt;
    }

    // H = A + B + C + D + E + F + G
    for (const k of ["A_b2c", "B_b2b", "C_zero_rated_export_with_payment", "D_sez_with_payment", "E_deemed_export", "F_advances_received", "G_inward_rcm"]) {
      table4.H_subtotal.taxable += table4[k].taxable; table4.H_subtotal.cgst += table4[k].cgst;
      table4.H_subtotal.sgst    += table4[k].sgst;    table4.H_subtotal.igst += table4[k].igst;
      table4.H_subtotal.cess    += table4[k].cess;
    }
    // N = H + J − I − L + K
    table4.N_supplies_on_which_tax_payable.taxable = table4.H_subtotal.taxable + table4.J_debit_notes_issued.taxable - table4.I_credit_notes_issued.taxable + table4.K_amendments_added.taxable - table4.L_amendments_reduced.taxable;
    table4.N_supplies_on_which_tax_payable.cgst    = table4.H_subtotal.cgst    + table4.J_debit_notes_issued.cgst    - table4.I_credit_notes_issued.cgst    + table4.K_amendments_added.cgst    - table4.L_amendments_reduced.cgst;
    table4.N_supplies_on_which_tax_payable.sgst    = table4.H_subtotal.sgst    + table4.J_debit_notes_issued.sgst    - table4.I_credit_notes_issued.sgst    + table4.K_amendments_added.sgst    - table4.L_amendments_reduced.sgst;
    table4.N_supplies_on_which_tax_payable.igst    = table4.H_subtotal.igst    + table4.J_debit_notes_issued.igst    - table4.I_credit_notes_issued.igst    + table4.K_amendments_added.igst    - table4.L_amendments_reduced.igst;

    const round4 = (g) => ({
      taxable: r2(g.taxable), cgst: r2(g.cgst), sgst: r2(g.sgst), igst: r2(g.igst), cess: r2(g.cess),
    });
    Object.keys(table4).forEach(k => { table4[k] = round4(table4[k]); });

    // ── Table 5: Non-taxable outward supplies ────────────────────────────
    // Romaa doesn't tag exempt/zero-rated separately — defaults to zero.
    const table5 = {
      A_zero_rated_no_payment:    { taxable: 0 },
      B_sez_no_payment:           { taxable: 0 },
      C_outward_rcm_to_be_paid_by_recipient: { taxable: 0 },
      D_exempted:                 { taxable: 0 },
      E_nil_rated:                { taxable: 0 },
      F_non_gst_supply:           { taxable: 0 },
      G_subtotal:                 { taxable: 0 },
      H_credit_notes_issued:      { taxable: 0 },
      I_debit_notes_issued:       { taxable: 0 },
      J_amendments_added:         { taxable: 0 },
      K_amendments_reduced:       { taxable: 0 },
      M_supplies_on_which_tax_not_payable: { taxable: 0 },
      N_total_turnover_4N_plus_5M: { taxable: r2(table4.N_supplies_on_which_tax_payable.taxable) },
    };

    // ── Table 6: ITC availed ─────────────────────────────────────────────
    const inputItc = {
      cgst: g2b.summary.total_cgst || 0,
      sgst: g2b.summary.total_sgst || 0,
      igst: g2b.summary.total_igst || 0,
    };
    const table6 = {
      A_total_itc_availed_per_3b: {
        cgst: g3b.input_itc.from_documents.cgst,
        sgst: g3b.input_itc.from_documents.sgst,
        igst: g3b.input_itc.from_documents.igst,
        cess: 0,
      },
      // Romaa doesn't separate inputs/capital goods/input services in 2B —
      // we map all inward to "Inputs" by default. The CA can re-classify
      // capital-goods purchases at filing via supporting workings.
      B_inputs_other_than_imports_rcm: {
        taxable: g2b.summary.total_taxable, cgst: inputItc.cgst, sgst: inputItc.sgst, igst: inputItc.igst, cess: 0,
      },
      C_inputs_rcm_received_unregistered: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      D_inputs_rcm_received_registered:   { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      E_imports_inputs:           { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      F_imports_capital_goods:    { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      G_isd:                      { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      H_amount_of_itc_reclaimed:  { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      I_subtotal:                 { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      J_difference_I_minus_A:     { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      K_transition_credit_tran1:  { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      L_transition_credit_tran2:  { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      M_other_itc:                { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      N_total_itc_availed:        { cgst: 0, sgst: 0, igst: 0, cess: 0 },
    };
    // I = B + C + D + E + F + G + H
    for (const k of ["B_inputs_other_than_imports_rcm", "C_inputs_rcm_received_unregistered", "D_inputs_rcm_received_registered", "E_imports_inputs", "F_imports_capital_goods", "G_isd", "H_amount_of_itc_reclaimed"]) {
      table6.I_subtotal.cgst += table6[k].cgst; table6.I_subtotal.sgst += table6[k].sgst;
      table6.I_subtotal.igst += table6[k].igst; table6.I_subtotal.cess += (table6[k].cess || 0);
    }
    table6.J_difference_I_minus_A.cgst = table6.I_subtotal.cgst - table6.A_total_itc_availed_per_3b.cgst;
    table6.J_difference_I_minus_A.sgst = table6.I_subtotal.sgst - table6.A_total_itc_availed_per_3b.sgst;
    table6.J_difference_I_minus_A.igst = table6.I_subtotal.igst - table6.A_total_itc_availed_per_3b.igst;
    // N = I + K + L + M
    table6.N_total_itc_availed.cgst = table6.I_subtotal.cgst + table6.K_transition_credit_tran1.cgst + table6.L_transition_credit_tran2.cgst + table6.M_other_itc.cgst;
    table6.N_total_itc_availed.sgst = table6.I_subtotal.sgst + table6.K_transition_credit_tran1.sgst + table6.L_transition_credit_tran2.sgst + table6.M_other_itc.sgst;
    table6.N_total_itc_availed.igst = table6.I_subtotal.igst + table6.K_transition_credit_tran1.igst + table6.L_transition_credit_tran2.igst + table6.M_other_itc.igst;

    const round6 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));
    Object.keys(table6).forEach(k => { table6[k] = round6(table6[k]); });

    // ── Table 7: ITC reversed ────────────────────────────────────────────
    const table7 = {
      A_rule_37:               { cgst: 0, sgst: 0, igst: 0, cess: 0 }, // unpaid invoices > 180 days
      B_rule_39:               { cgst: 0, sgst: 0, igst: 0, cess: 0 }, // ISD reversal
      C_rule_42:               { cgst: 0, sgst: 0, igst: 0, cess: 0 }, // exempt + taxable mix
      D_rule_43:               { cgst: 0, sgst: 0, igst: 0, cess: 0 }, // capital goods exempt + taxable mix
      E_section_17_5_blocked:  { cgst: 0, sgst: 0, igst: 0, cess: 0 }, // blocked credits
      F_other:                 {
        cgst: g3b.itc_reversed.cgst, sgst: g3b.itc_reversed.sgst,
        igst: g3b.itc_reversed.igst, cess: 0,
      },
      G_total: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      H_net_itc_available_6N_minus_7G: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
    };
    for (const k of ["A_rule_37", "B_rule_39", "C_rule_42", "D_rule_43", "E_section_17_5_blocked", "F_other"]) {
      table7.G_total.cgst += table7[k].cgst; table7.G_total.sgst += table7[k].sgst;
      table7.G_total.igst += table7[k].igst; table7.G_total.cess += table7[k].cess;
    }
    table7.H_net_itc_available_6N_minus_7G.cgst = table6.N_total_itc_availed.cgst - table7.G_total.cgst;
    table7.H_net_itc_available_6N_minus_7G.sgst = table6.N_total_itc_availed.sgst - table7.G_total.sgst;
    table7.H_net_itc_available_6N_minus_7G.igst = table6.N_total_itc_availed.igst - table7.G_total.igst;
    Object.keys(table7).forEach(k => { table7[k] = round6(table7[k]); });

    // ── Table 8: ITC matching with GSTR-2A / 2B ──────────────────────────
    const table8 = {
      A_itc_per_2a_2b: {
        cgst: g2b.summary.total_cgst || 0, sgst: g2b.summary.total_sgst || 0,
        igst: g2b.summary.total_igst || 0, cess: 0,
      },
      B_itc_per_table_6_B_H: { cgst: table6.B_inputs_other_than_imports_rcm.cgst, sgst: table6.B_inputs_other_than_imports_rcm.sgst, igst: table6.B_inputs_other_than_imports_rcm.igst, cess: 0 },
      C_itc_per_invoices_received_in_subsequent_fy: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      D_difference_A_minus_B_C: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      E_itc_available_but_not_availed: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      F_itc_available_but_ineligible:  { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      G_igst_paid_on_imports:          { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      H_igst_credit_availed_on_imports: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      I_difference_G_minus_H:          { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      J_itc_available_but_not_availed_on_import: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
      K_total_itc_lapsed: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
    };
    table8.D_difference_A_minus_B_C.cgst = table8.A_itc_per_2a_2b.cgst - table8.B_itc_per_table_6_B_H.cgst - table8.C_itc_per_invoices_received_in_subsequent_fy.cgst;
    table8.D_difference_A_minus_B_C.sgst = table8.A_itc_per_2a_2b.sgst - table8.B_itc_per_table_6_B_H.sgst - table8.C_itc_per_invoices_received_in_subsequent_fy.sgst;
    table8.D_difference_A_minus_B_C.igst = table8.A_itc_per_2a_2b.igst - table8.B_itc_per_table_6_B_H.igst - table8.C_itc_per_invoices_received_in_subsequent_fy.igst;
    Object.keys(table8).forEach(k => { table8[k] = round6(table8[k]); });

    // ── Table 9: Tax paid / payable ──────────────────────────────────────
    const table9 = {
      integrated_tax: { tax_payable: g3b.net_gst_payable.igst, paid_in_cash: 0, paid_through_itc: 0, interest: 0, late_fee: 0, penalty: 0, other: 0 },
      central_tax:    { tax_payable: g3b.net_gst_payable.cgst, paid_in_cash: 0, paid_through_itc: 0, interest: 0, late_fee: 0, penalty: 0, other: 0 },
      state_ut_tax:   { tax_payable: g3b.net_gst_payable.sgst, paid_in_cash: 0, paid_through_itc: 0, interest: 0, late_fee: 0, penalty: 0, other: 0 },
      cess:           { tax_payable: 0, paid_in_cash: 0, paid_through_itc: 0, interest: 0, late_fee: 0, penalty: 0, other: 0 },
    };
    Object.keys(table9).forEach(k => { table9[k] = round6(table9[k]); });

    // ── Table 17: HSN-wise outward summary ───────────────────────────────
    // Construction-firm bills are works contracts — default SAC 9954.
    // We group by tax-rate slab since outward bills don't carry HSN per item.
    const hsnOutMap = {};
    const allOutRows = [...(g1.b2b?.rows || []), ...(g1.b2cl?.rows || [])];
    for (const r of allOutRows) {
      const rate = r2(r.cgst_pct + r.sgst_pct + r.igst_pct);
      const key  = `9954|${rate}`;
      if (!hsnOutMap[key]) {
        hsnOutMap[key] = {
          hsn_code: "9954", description: "Works Contract Service (default)",
          uqc: "OTH", quantity: 0, rate_pct: rate, taxable: 0,
          cgst: 0, sgst: 0, igst: 0, cess: 0, invoice_count: 0,
        };
      }
      hsnOutMap[key].taxable += r.taxable; hsnOutMap[key].cgst += r.cgst_amt;
      hsnOutMap[key].sgst    += r.sgst_amt; hsnOutMap[key].igst += r.igst_amt;
      hsnOutMap[key].invoice_count += 1;
    }
    for (const r of (g1.b2cs?.rows || [])) {
      const rate = r2(r.rate_pct);
      const key  = `9954|${rate}`;
      if (!hsnOutMap[key]) {
        hsnOutMap[key] = {
          hsn_code: "9954", description: "Works Contract Service (default)",
          uqc: "OTH", quantity: 0, rate_pct: rate, taxable: 0,
          cgst: 0, sgst: 0, igst: 0, cess: 0, invoice_count: 0,
        };
      }
      hsnOutMap[key].taxable += r.taxable; hsnOutMap[key].cgst += r.cgst;
      hsnOutMap[key].sgst    += r.sgst;    hsnOutMap[key].igst += r.igst;
      hsnOutMap[key].invoice_count += r.invoice_count;
    }
    const table17 = Object.values(hsnOutMap)
      .map(r => ({ ...r, taxable: r2(r.taxable), cgst: r2(r.cgst), sgst: r2(r.sgst), igst: r2(r.igst) }))
      .sort((a, b) => b.taxable - a.taxable);

    // ── Table 18: HSN-wise inward summary ────────────────────────────────
    // Aggregate from PurchaseBill line_items joined to Material.hsnSac.
    const inwardBills = await PurchaseBillModel.find({
      status: "approved",
      bill_date: { $gte: from, $lte: to },
    }, { line_items: 1 }).lean();

    const itemIds = new Set();
    for (const b of inwardBills) {
      for (const li of (b.line_items || [])) {
        if (li.item_id) itemIds.add(String(li.item_id));
      }
    }
    let hsnByItem = {};
    if (itemIds.size > 0) {
      const mats = await MaterialModel.find(
        { _id: { $in: [...itemIds] } },
        { hsnSac: 1, name: 1, unit: 1 },
      ).lean();
      hsnByItem = Object.fromEntries(mats.map(m => [String(m._id), m]));
    }

    const hsnInMap = {};
    for (const b of inwardBills) {
      for (const li of (b.line_items || [])) {
        const mat = li.item_id ? hsnByItem[String(li.item_id)] : null;
        const hsn = mat?.hsnSac || "UNKNOWN";
        const desc = mat?.name || li.item_description || "";
        const uqc  = li.unit || mat?.unit || "OTH";
        const rate = r2((li.cgst_pct || 0) + (li.sgst_pct || 0) + (li.igst_pct || 0));
        const key  = `${hsn}|${rate}|${uqc}`;
        if (!hsnInMap[key]) {
          hsnInMap[key] = {
            hsn_code: hsn, description: desc, uqc, quantity: 0,
            rate_pct: rate, taxable: 0,
            cgst: 0, sgst: 0, igst: 0, cess: 0, invoice_count: 0,
          };
        }
        hsnInMap[key].quantity += (li.accepted_qty || 0);
        hsnInMap[key].taxable  += (li.gross_amt    || 0);
        hsnInMap[key].cgst     += (li.cgst_amt     || 0);
        hsnInMap[key].sgst     += (li.sgst_amt     || 0);
        hsnInMap[key].igst     += (li.igst_amt     || 0);
        hsnInMap[key].invoice_count += 1;
      }
    }
    const table18 = Object.values(hsnInMap)
      .map(r => ({
        ...r,
        quantity: r2(r.quantity), taxable: r2(r.taxable),
        cgst: r2(r.cgst), sgst: r2(r.sgst), igst: r2(r.igst),
      }))
      .sort((a, b) => b.taxable - a.taxable);

    // ── Notes & caveats ──────────────────────────────────────────────────
    const notes = [
      "GSTR-9 is a draft — reconcile with GSTN portal totals before filing.",
      "Tables 5 (non-taxable supplies) defaulted to zero — Romaa doesn't tag exempt/zero-rated/non-GST supplies.",
      "Table 6 ITC classification (inputs vs. capital goods vs. input services) defaulted to 'Inputs'. CA should re-classify capital-goods at filing.",
      "Table 7 ITC-reversal breakdown by Rule (37/39/42/43/§17(5)) defaulted to 'Other' — Romaa doesn't tag reversal reasons.",
      "Table 17 outward HSN defaulted to SAC 9954 (Works Contract Service) — over-ride per-bill HSN if products were also sold.",
      "Tables 10-16, 19 (prior-FY adjustments / amendments / demands / late fee) are not auto-populated. Add manually at filing.",
    ];

    return {
      financial_year,
      from_date: from,
      to_date:   to,
      table4,
      table5,
      table6,
      table7,
      table8,
      table9,
      table17_outward_hsn: table17,
      table18_inward_hsn:  table18,
      summary: {
        total_outward_taxable_supplies: table4.N_supplies_on_which_tax_payable.taxable,
        total_outward_tax: r2(table4.N_supplies_on_which_tax_payable.cgst + table4.N_supplies_on_which_tax_payable.sgst + table4.N_supplies_on_which_tax_payable.igst),
        total_itc_availed:  r2(table6.N_total_itc_availed.cgst + table6.N_total_itc_availed.sgst + table6.N_total_itc_availed.igst),
        total_itc_reversed: r2(table7.G_total.cgst + table7.G_total.sgst + table7.G_total.igst),
        net_itc_available:  r2(table7.H_net_itc_available_6N_minus_7G.cgst + table7.H_net_itc_available_6N_minus_7G.sgst + table7.H_net_itc_available_6N_minus_7G.igst),
        net_tax_payable:    r2(table9.integrated_tax.tax_payable + table9.central_tax.tax_payable + table9.state_ut_tax.tax_payable),
        outward_hsn_lines:  table17.length,
        inward_hsn_lines:   table18.length,
      },
      notes,
    };
  }
}

export default ReportsService;
