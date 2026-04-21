import YearEndCloseModel from "./yearendclose.model.js";
import JournalEntryModel from "../journalentry/journalentry.model.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import FinanceCounterModel from "../FinanceCounter.model.js";
import ReportsService from "../reports/reports.service.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// FY helper — "YY-YY" for a given date (April–March)
function getFY(date) {
  const d     = new Date(date);
  const month = d.getMonth() + 1;
  const year  = d.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

function fyRange(fy) {
  const [ss, ee] = fy.split("-");
  const century  = new Date().getFullYear() >= 2100 ? 2100 : 2000;
  const startYr  = century + parseInt(ss, 10);
  const endYr    = century + parseInt(ee, 10);
  return {
    start: new Date(startYr, 3, 1, 0, 0, 0, 0),
    end:   new Date(endYr,   2, 31, 23, 59, 59, 999),
  };
}

// Allocate a JE number inside a specific FY (not the current one).
async function nextJeNoFor(fy) {
  const counter = await FinanceCounterModel.findByIdAndUpdate(
    `JE/${fy}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `JE/${fy}/${String(counter.seq).padStart(4, "0")}`;
}

// Sum signed Dr-positive balance for Asset/Liability/Equity accounts at a given date.
async function balanceSheetSnapshot(asOf) {
  const accounts = await AccountTreeModel.find({
    is_deleted: false,
    is_group:   false,
    is_posting_account: true,
    account_type: { $in: ["Asset", "Liability", "Equity"] },
  }).select("account_code account_name account_type opening_balance opening_balance_type").lean();

  const codes = accounts.map((a) => a.account_code);
  const agg = await JournalEntryModel.aggregate([
    { $match: { status: "approved", je_date: { $lte: asOf } } },
    { $unwind: "$lines" },
    { $match: { "lines.account_code": { $in: codes } } },
    { $group: {
      _id: "$lines.account_code",
      total_debit:  { $sum: "$lines.debit_amt"  },
      total_credit: { $sum: "$lines.credit_amt" },
    } },
  ]);
  const mvMap = {};
  for (const m of agg) mvMap[m._id] = m;

  return accounts.map((acc) => {
    const mv = mvMap[acc.account_code] || { total_debit: 0, total_credit: 0 };
    const openingSigned = (acc.opening_balance || 0) * (acc.opening_balance_type === "Cr" ? -1 : 1);
    const balance       = r2(openingSigned + (mv.total_debit - mv.total_credit)); // Dr-positive
    return {
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      balance,
    };
  }).filter((r) => r.balance !== 0);
}

class YearEndCloseService {

  // ── Status helper used by other services to gate backdated postings ───────
  static async isClosed(financial_year) {
    if (!financial_year) return false;
    const rec = await YearEndCloseModel.findOne({ financial_year }).select("status").lean();
    return !!rec && rec.status === "closed";
  }

  static async list() {
    return YearEndCloseModel.find({}).sort({ financial_year: -1 }).lean();
  }

  // ── Opening balance rollforward (Gap 7) ─────────────────────────────────────
  //
  // Returns the definitive opening balances for an FY. Sourced in order:
  //   1) the PRIOR FY's sealed balance_sheet_snapshot (authoritative once
  //      that FY has been closed)
  //   2) live recompute as of the FY start − 1 ms (if prior FY is not closed)
  //
  // Shape: [{account_code, account_name, account_type, opening_balance (Dr-positive)}]
  // Plus net_profit_carried (if we're using option 1) — the P&L net that rolled
  // into Retained Earnings when prior FY closed.
  static async openingBalances(financial_year) {
    if (!financial_year) throw new Error("financial_year is required");
    const { start } = fyRange(financial_year);

    // Previous FY string
    const [ss] = financial_year.split("-");
    const prevStart = parseInt(ss, 10) - 1;
    const prevFy    = `${String(prevStart).padStart(2, "0")}-${String(prevStart + 1).padStart(2, "0")}`;

    const prior = await YearEndCloseModel.findOne({ financial_year: prevFy, status: "closed" }).lean();
    if (prior) {
      return {
        financial_year,
        source:              "sealed_snapshot",
        source_fy:           prevFy,
        net_profit_carried:  prior.pnl_snapshot?.net_profit || 0,
        retained_earnings_code: prior.retained_earnings_code || "",
        rows:                prior.balance_sheet_snapshot.map((r) => ({
          account_code: r.account_code,
          account_name: r.account_name,
          account_type: r.account_type,
          opening_balance: r.balance,
        })),
      };
    }

    // Fallback: live recompute at FY start − 1ms
    const asOf = new Date(start.getTime() - 1);
    const rows = await balanceSheetSnapshot(asOf);
    return {
      financial_year,
      source:              "live_recompute",
      source_fy:           prevFy,
      net_profit_carried:  null,      // unknown — prior FY not closed
      rows:                rows.map((r) => ({ ...r, opening_balance: r.balance })),
    };
  }

  static async get(financial_year) {
    return YearEndCloseModel.findOne({ financial_year }).lean();
  }

  // Preview P&L + BS for an FY without creating any JE / record.
  static async preview({ financial_year }) {
    if (!financial_year) throw new Error("financial_year is required (e.g. '25-26')");
    const { start, end } = fyRange(financial_year);
    const pnl = await ReportsService.profitLoss({ from_date: start, to_date: end });
    const bs  = await balanceSheetSnapshot(end);
    return {
      financial_year,
      fy_start_date: start,
      fy_end_date:   end,
      pnl,
      balance_sheet: bs,
    };
  }

  // Close the books for an FY. Creates one approved closing JE that debits all
  // Income accounts (to zero) and credits all Expense accounts (to zero), with
  // the net booked to the retained-earnings account.
  static async closeFY({ financial_year, retained_earnings_code, user_id = "", force = false }) {
    if (!financial_year)            throw new Error("financial_year is required");
    if (!retained_earnings_code)    throw new Error("retained_earnings_code is required (Reserves/Equity leaf account)");

    const existing = await YearEndCloseModel.findOne({ financial_year });
    if (existing && existing.status === "closed" && !force) {
      throw new Error(`FY ${financial_year} is already closed`);
    }

    const reAcc = await AccountTreeModel.findOne({
      account_code: retained_earnings_code,
      is_deleted: false,
      is_group: false,
      is_posting_account: true,
    }).lean();
    if (!reAcc)                          throw new Error(`Retained earnings account '${retained_earnings_code}' not found`);
    if (reAcc.account_type !== "Equity") throw new Error(`Account '${retained_earnings_code}' must be of type Equity`);

    const { start, end } = fyRange(financial_year);

    // 1) P&L for the FY
    const pnl = await ReportsService.profitLoss({ from_date: start, to_date: end });

    // 2) Build closing lines — zero every non-zero Income (Dr) and Expense (Cr) account.
    //    Income has Cr-normal balance (credit − debit > 0) → Dr it to zero.
    //    Expense has Dr-normal balance (debit − credit > 0) → Cr it to zero.
    const lines = [];
    const incomeSum = r2(pnl.income.total);
    const expenseSum = r2(pnl.expense.total);

    for (const grp of pnl.income.groups) {
      for (const l of grp.lines) {
        if (!l.amount) continue;
        lines.push({
          account_code: l.account_code,
          dr_cr: "Dr",
          debit_amt: r2(l.amount),
          credit_amt: 0,
          narration: `Closing entry — ${l.account_name} → Retained Earnings (FY ${financial_year})`,
        });
      }
    }
    for (const grp of pnl.expense.groups) {
      for (const l of grp.lines) {
        if (!l.amount) continue;
        lines.push({
          account_code: l.account_code,
          dr_cr: "Cr",
          debit_amt: 0,
          credit_amt: r2(l.amount),
          narration: `Closing entry — ${l.account_name} → Retained Earnings (FY ${financial_year})`,
        });
      }
    }

    // Balancing line to Retained Earnings
    const netProfit = r2(incomeSum - expenseSum);   // + = profit → credit RE ; − = loss → debit RE
    if (netProfit > 0) {
      lines.push({
        account_code: retained_earnings_code,
        dr_cr: "Cr",
        debit_amt: 0,
        credit_amt: r2(netProfit),
        narration: `Net profit transfer — FY ${financial_year}`,
      });
    } else if (netProfit < 0) {
      lines.push({
        account_code: retained_earnings_code,
        dr_cr: "Dr",
        debit_amt: r2(-netProfit),
        credit_amt: 0,
        narration: `Net loss transfer — FY ${financial_year}`,
      });
    }

    if (lines.length < 2) {
      // No income or expense movement — still record an idempotent close marker.
      const rec = await YearEndCloseModel.findOneAndUpdate(
        { financial_year },
        {
          financial_year,
          fy_start_date: start,
          fy_end_date:   end,
          status:        "closed",
          retained_earnings_code,
          pnl_snapshot: {
            total_income:  0,
            total_expense: 0,
            net_profit:    0,
            income_lines:  [],
            expense_lines: [],
          },
          balance_sheet_snapshot: await balanceSheetSnapshot(end),
          closed_on:  new Date(),
          closed_by:  user_id,
        },
        { new: true, upsert: true },
      );
      return { record: rec, closing_je: null, note: "No P&L movement — close recorded without JE" };
    }

    // 3) Create approved closing JE — must bypass isClosed guard since the
    //    close-record will be flipped to "closed" in step (4) right after.
    const je_no = await nextJeNoFor(financial_year);
    const closingJe = await JournalEntryService.create({
      je_no,
      je_date: end,
      document_year: financial_year,
      je_type: "Adjustment",
      narration: `Year-end closing — FY ${financial_year}`,
      lines,
      status: "approved",
      created_by: user_id || null,
      allow_closed_fy: true,
    });

    // 4) Persist close record with snapshots
    const bsSnap = await balanceSheetSnapshot(end);
    const rec = await YearEndCloseModel.findOneAndUpdate(
      { financial_year },
      {
        financial_year,
        fy_start_date: start,
        fy_end_date:   end,
        status:        "closed",
        retained_earnings_code,
        pnl_snapshot: {
          total_income:  incomeSum,
          total_expense: expenseSum,
          net_profit:    netProfit,
          income_lines:  pnl.income.groups.flatMap((g) =>
            g.lines.map((l) => ({ account_code: l.account_code, account_name: l.account_name, amount: l.amount })),
          ),
          expense_lines: pnl.expense.groups.flatMap((g) =>
            g.lines.map((l) => ({ account_code: l.account_code, account_name: l.account_name, amount: l.amount })),
          ),
        },
        balance_sheet_snapshot: bsSnap,
        closing_je_ref: closingJe._id,
        closing_je_no:  closingJe.je_no,
        closed_on:      new Date(),
        closed_by:      user_id,
        reversal_je_ref: null,
        reversal_je_no:  "",
        reopened_on:     null,
        reopened_by:     "",
        reopen_reason:   "",
      },
      { new: true, upsert: true },
    );

    return { record: rec, closing_je: closingJe };
  }

  // Reopen a closed FY — creates a reversing JE for the closing JE.
  static async reopen({ financial_year, user_id = "", reason = "" }) {
    const rec = await YearEndCloseModel.findOne({ financial_year });
    if (!rec)                         throw new Error(`No close record for FY ${financial_year}`);
    if (rec.status !== "closed")      throw new Error(`FY ${financial_year} is not currently closed (status: ${rec.status})`);
    if (!rec.closing_je_ref)          throw new Error(`FY ${financial_year} close has no linked JE to reverse`);

    const reversal = await JournalEntryService.reverse(String(rec.closing_je_ref), {
      narration: `Reopen FY ${financial_year} — ${reason || "no reason provided"}`,
      created_by: user_id || null,
    });

    rec.status          = "reopened";
    rec.reversal_je_ref = reversal._id;
    rec.reversal_je_no  = reversal.je_no;
    rec.reopened_on     = new Date();
    rec.reopened_by     = user_id;
    rec.reopen_reason   = reason || "";
    await rec.save();

    return { record: rec, reversal_je: reversal };
  }
}

export default YearEndCloseService;
