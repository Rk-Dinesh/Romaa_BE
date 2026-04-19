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

// ── GST account codes (constant — set in accounttree.seed.js) ────────────────
const GST_INPUT_CODES   = ["1080-CGST", "1080-SGST", "1080-IGST"];
const GST_OUTPUT_CODES  = ["2110", "2120", "2130"]; // CGST/SGST/IGST Payable
const TDS_PAYABLE_CODE  = "2140";

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
      }).lean(),
      ClientCNModel.find({
        status: "Approved",
        ccn_date: { $gte: from, $lte: to },
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
      }).lean(),
      DebitNoteModel.find({
        status: "approved",
        dn_date: { $gte: from, $lte: to },
      }).lean(),
      ExpenseVoucherModel.find({
        status:  "approved",
        ev_date: { $gte: from, $lte: to },
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

    const ledgerOutCgst = r2((movements["2110"]?.total_credit || 0) - (movements["2110"]?.total_debit || 0));
    const ledgerOutSgst = r2((movements["2120"]?.total_credit || 0) - (movements["2120"]?.total_debit || 0));
    const ledgerOutIgst = r2((movements["2130"]?.total_credit || 0) - (movements["2130"]?.total_debit || 0));

    const ledgerInCgst  = r2((movements["1080-CGST"]?.total_debit || 0) - (movements["1080-CGST"]?.total_credit || 0));
    const ledgerInSgst  = r2((movements["1080-SGST"]?.total_debit || 0) - (movements["1080-SGST"]?.total_credit || 0));
    const ledgerInIgst  = r2((movements["1080-IGST"]?.total_debit || 0) - (movements["1080-IGST"]?.total_credit || 0));

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
}

export default ReportsService;
