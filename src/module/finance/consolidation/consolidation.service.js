import JournalEntryModel from "../journalentry/journalentry.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import TenderModel from "../../tender/tender/tender.model.js";

// ── Multi-Entity Consolidation ───────────────────────────────────────────────
//
// The system today runs one legal entity, but every JE line can be tagged with
// a tender_id (project / business unit / cost centre). For consolidation we
// treat each tender as a pseudo-entity and roll up:
//
//   - Entity-wise P&L and Balance Sheet
//   - Company-wide consolidated P&L (sum of entities + corporate un-tagged)
//   - Inter-entity eliminations — any JE that tags two different tender_ids on
//     opposite Dr/Cr sides is an inter-entity transfer that must be eliminated
//     in consolidation so it doesn't inflate both sides.
//
// Entities in this model:
//   - Each active Tender
//   - The synthetic "__CORPORATE__" entity for un-tagged JE lines

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;
const CORP = "__CORPORATE__";

// ── Current financial year helper ─────────────────────────────────────────────
const currentFY = () => {
  const now  = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
};

function getFY(date) {
  const d = new Date(date), m = d.getMonth() + 1, y = d.getFullYear();
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}
function fyStart(fy) {
  const yy = parseInt(fy.split("-")[0], 10);
  const century = new Date().getFullYear() >= 2100 ? 2100 : 2000;
  return new Date(century + yy, 3, 1, 0, 0, 0, 0);
}

// Effective tender for a JE line = line-level tender if set, else header tender, else __CORPORATE__
function effectiveTender(je, line) {
  return line.tender_id || je.tender_id || CORP;
}

class ConsolidationService {

  // GET /consolidation/entities
  static async entities() {
    try {
      const tenders = await TenderModel.find({})
        .select("tender_id tender_name status")
        .sort({ tender_id: 1 })
        .lean();
      return [
        ...tenders.map((t) => ({ id: t.tender_id, name: t.tender_name, status: t.status, type: "Tender" })),
        { id: CORP, name: "Corporate / Un-tagged", type: "Synthetic" },
      ];
    } catch (error) {
      throw error;
    }
  }

  // GET /consolidation/trial-balance?as_of_date=
  // Returns per-entity column + grand total in one matrix.
  static async trialBalance({ as_of_date }) {
    try {
    const asOf = as_of_date ? new Date(as_of_date) : new Date();
    asOf.setHours(23, 59, 59, 999);

    const accounts = await AccountTreeModel.find({
      is_deleted: false, is_group: false, is_posting_account: true,
    }).select("account_code account_name account_type account_subtype opening_balance opening_balance_type").lean();

    const rows = await JournalEntryModel.aggregate([
      { $match: { status: "approved", je_date: { $lte: asOf }, is_deleted: { $ne: true } } },
      { $limit: 10000 },
      { $unwind: "$lines" },
      { $project: {
        account_code: "$lines.account_code",
        debit_amt:    "$lines.debit_amt",
        credit_amt:   "$lines.credit_amt",
        effective_tender: {
          $cond: [
            { $and: [{ $ne: ["$lines.tender_id", null] }, { $ne: ["$lines.tender_id", ""] }] },
            "$lines.tender_id",
            { $cond: [
              { $and: [{ $ne: ["$tender_id", null] }, { $ne: ["$tender_id", ""] }] },
              "$tender_id",
              CORP,
            ]},
          ],
        },
      }},
      { $group: {
        _id: { account_code: "$account_code", tender: "$effective_tender" },
        total_debit:  { $sum: "$debit_amt" },
        total_credit: { $sum: "$credit_amt" },
      }},
    ]);

    // Pivot: [account_code][tender] = { debit, credit, balance }
    const mat = {};
    for (const r of rows) {
      const { account_code, tender } = r._id;
      if (!mat[account_code]) mat[account_code] = {};
      mat[account_code][tender] = {
        total_debit:  r2(r.total_debit),
        total_credit: r2(r.total_credit),
        balance:      r2(r.total_debit - r.total_credit),   // Dr-positive
      };
    }

    const entitiesSet = new Set([CORP]);
    for (const code of Object.keys(mat)) {
      for (const t of Object.keys(mat[code])) entitiesSet.add(t);
    }
    const entities = Array.from(entitiesSet).sort();

    const output = accounts.map((acc) => {
      const perEntity = {};
      let consolidated = 0;
      for (const e of entities) {
        const cell = mat[acc.account_code]?.[e];
        if (cell) {
          perEntity[e] = cell;
          consolidated += cell.balance;
        }
      }
      const openingSigned = (acc.opening_balance || 0) * (acc.opening_balance_type === "Cr" ? -1 : 1);
      return {
        account_code:    acc.account_code,
        account_name:    acc.account_name,
        account_type:    acc.account_type,
        account_subtype: acc.account_subtype,
        opening_balance: openingSigned,
        per_entity:      perEntity,
        consolidated:    r2(openingSigned + consolidated),
      };
    }).filter((r) => r.consolidated !== 0 || Object.keys(r.per_entity).length > 0);

    return { as_of_date: asOf, entities, rows: output };
    } catch (error) {
      throw error;
    }
  }

  // GET /consolidation/pnl?financial_year=25-26
  // Returns per-entity P&L + consolidated total.
  //
  // Single-pipeline implementation (Gap 13): one JournalEntry aggregation that
  // groups Income + Expense movements by (account_code × effective_tender).
  // Previously this looped ReportsService.profitLoss once per tender (N+1
  // round-trips) and derived CORP by delta, which could drift when account
  // filters changed. Everything here now flows from a single result set and
  // one AccountTree fetch — entity rows, CORP, and the consolidated total.
  static async pnl({ financial_year, from_date, to_date }) {
    try {
    const fy    = financial_year || currentFY();
    const start = from_date ? new Date(from_date) : fyStart(fy);
    const end   = to_date   ? new Date(to_date)   : new Date();
    end.setHours(23, 59, 59, 999);

    // 1. Load Income + Expense posting accounts once.
    const accounts = await AccountTreeModel.find({
      is_deleted: false,
      is_group:   false,
      is_posting_account: true,
      account_type: { $in: ["Income", "Expense"] },
    }).select("account_code account_type").lean();

    const typeOf = Object.fromEntries(accounts.map((a) => [a.account_code, a.account_type]));
    const codes  = accounts.map((a) => a.account_code);
    if (codes.length === 0) {
      return { financial_year: fy, from_date: start, to_date: end, entities: [], consolidated: { income: 0, expense: 0, net_profit: 0, pnl_elimination: 0, income_after_elim: 0, expense_after_elim: 0, net_profit_after_elim: 0 } };
    }

    // 2. Tender_id → name map (for display).
    const tenderList = await TenderModel.find({}).select("tender_id tender_name").lean();
    const tenderName = Object.fromEntries(tenderList.map((t) => [t.tender_id, t.tender_name]));

    // 3. Single aggregation — group by (account × effective_tender).
    const rows = await JournalEntryModel.aggregate([
      { $match: { status: "approved", je_date: { $gte: start, $lte: end }, fin_year: fy, is_deleted: { $ne: true } } },
      { $limit: 10000 },
      { $unwind: "$lines" },
      { $match: { "lines.account_code": { $in: codes } } },
      { $project: {
        account_code: "$lines.account_code",
        debit_amt:    "$lines.debit_amt",
        credit_amt:   "$lines.credit_amt",
        effective_tender: {
          $cond: [
            { $and: [{ $ne: ["$lines.tender_id", null] }, { $ne: ["$lines.tender_id", ""] }] },
            "$lines.tender_id",
            { $cond: [
              { $and: [{ $ne: ["$tender_id", null] }, { $ne: ["$tender_id", ""] }] },
              "$tender_id",
              CORP,
            ]},
          ],
        },
      }},
      { $group: {
        _id: { account_code: "$account_code", tender: "$effective_tender" },
        total_debit:  { $sum: "$debit_amt"  },
        total_credit: { $sum: "$credit_amt" },
      }},
    ]);

    // 4. Roll up to per-entity income/expense and a consolidated total.
    //    Income (Cr-normal): net = credit − debit.
    //    Expense (Dr-normal): net = debit − credit.
    const byEntity = {};   // tender → { income, expense }
    let totalIncome  = 0;
    let totalExpense = 0;

    for (const r of rows) {
      const acctType = typeOf[r._id.account_code];
      if (!acctType) continue;
      const tender = r._id.tender;
      const bucket = byEntity[tender] || (byEntity[tender] = { income: 0, expense: 0 });

      if (acctType === "Income") {
        const amt = (r.total_credit || 0) - (r.total_debit || 0);
        bucket.income += amt;
        totalIncome   += amt;
      } else {
        const amt = (r.total_debit || 0) - (r.total_credit || 0);
        bucket.expense += amt;
        totalExpense   += amt;
      }
    }

    // 5. Shape per-entity rows (tender_id ordering + CORP last), skip zero rows.
    const entities = Object.entries(byEntity)
      .map(([entity_id, v]) => ({
        entity_id,
        entity_name: entity_id === CORP ? "Corporate / Un-tagged" : (tenderName[entity_id] || entity_id),
        income:      r2(v.income),
        expense:     r2(v.expense),
        net_profit:  r2(v.income - v.expense),
      }))
      .filter((e) => e.income !== 0 || e.expense !== 0)
      .sort((a, b) => {
        if (a.entity_id === CORP) return 1;
        if (b.entity_id === CORP) return -1;
        return a.entity_id.localeCompare(b.entity_id);
      });

    // 6. Inter-entity P&L elimination (Gap 9) still flows through _elimMap.
    const elim = await this._elimMap({ from_date: start, to_date: end });

    const incomeTotal  = r2(totalIncome);
    const expenseTotal = r2(totalExpense);
    const netProfit    = r2(incomeTotal - expenseTotal);

    const consolidated = {
      income:                incomeTotal,
      expense:               expenseTotal,
      net_profit:            netProfit,
      pnl_elimination:       elim.pnlTotal,
      income_after_elim:     r2(incomeTotal  - elim.pnlTotal),
      expense_after_elim:    r2(expenseTotal - elim.pnlTotal),
      net_profit_after_elim: netProfit,   // matched Dr+Cr → net unaffected
    };

    return {
      financial_year: fy,
      from_date: start,
      to_date:   end,
      entities,
      consolidated,
    };
    } catch (error) {
      throw error;
    }
  }

  // GET /consolidation/balance-sheet?as_of_date=
  // Per-entity BS pivoted from the trial balance; eliminates inter-entity
  // receivables/payables so the consolidated column doesn't double-count
  // internal settlements.
  static async balanceSheet({ as_of_date }) {
    try {
    const asOf = as_of_date ? new Date(as_of_date) : new Date();
    asOf.setHours(23, 59, 59, 999);

    const tb = await this.trialBalance({ as_of_date: asOf });
    const elim = await this._elimMap({ from_date: null, to_date: asOf });

    // Bucket TB rows by account_type → Asset / Liability / Equity
    const groups = { Asset: [], Liability: [], Equity: [] };
    for (const r of tb.rows) {
      if (!groups[r.account_type]) continue;
      const eliminated = elim.bsByAccount[r.account_code] || 0;
      groups[r.account_type].push({
        ...r,
        eliminated,
        consolidated_after_elim: r2(r.consolidated - eliminated),
      });
    }

    const totals = {};
    for (const g of Object.keys(groups)) {
      totals[g] = {
        gross:       r2(groups[g].reduce((s, r) => s + r.consolidated, 0)),
        eliminated:  r2(groups[g].reduce((s, r) => s + r.eliminated,   0)),
        net:         r2(groups[g].reduce((s, r) => s + r.consolidated_after_elim, 0)),
      };
    }
    // Note: Liabilities and Equity are Cr-normal, so their Dr-positive
    // "consolidated" totals are *negative*. Flip for presentation.
    totals.Liability.net_display = r2(-totals.Liability.net);
    totals.Equity.net_display    = r2(-totals.Equity.net);

    // Accounting identity check: Assets = Liabilities + Equity
    const check = r2(totals.Asset.net + totals.Liability.net + totals.Equity.net);
    return {
      as_of_date:  asOf,
      entities:    tb.entities,
      assets:      groups.Asset,
      liabilities: groups.Liability,
      equity:      groups.Equity,
      totals,
      balance_check: check,   // should be ~0 if books are in balance
    };
    } catch (error) {
      throw error;
    }
  }

  // GET /consolidation/inter-entity?financial_year=25-26
  // Finds JEs whose lines span two different tender_ids. Splits into P&L
  // eliminations (Income/Expense — the gross side) vs. BS eliminations
  // (Asset/Liability — the settlement side) so downstream reports can subtract
  // the right amounts.
  static async interEntity({ financial_year, from_date, to_date }) {
    try {
    const fy = financial_year || getFY(new Date());
    const start = from_date ? new Date(from_date) : fyStart(fy);
    const end   = to_date   ? new Date(to_date)   : new Date();
    end.setHours(23, 59, 59, 999);

    const jes = await JournalEntryModel.find({
      status:  "approved",
      je_date: { $gte: start, $lte: end },
      is_deleted: { $ne: true },
    }).select("je_no je_date narration lines tender_id total_debit").limit(10000).lean();

    // Pre-load account types for fast lookup
    const codes = [...new Set(jes.flatMap((j) => j.lines.map((l) => l.account_code)))];
    const accs  = await AccountTreeModel.find({ account_code: { $in: codes } })
      .select("account_code account_type").lean();
    const typeOf = Object.fromEntries(accs.map((a) => [a.account_code, a.account_type]));

    const hits = [];
    let pnl_elim = 0, bs_elim = 0;
    for (const je of jes) {
      const tenderSet = new Set();
      for (const l of je.lines) tenderSet.add(effectiveTender(je, l));
      if (tenderSet.size <= 1) continue;

      const entries = je.lines.map((l) => ({
        account_code: l.account_code,
        account_name: l.account_name,
        account_type: typeOf[l.account_code] || "",
        dr_cr:        l.dr_cr,
        amount:       r2(l.debit_amt || l.credit_amt),
        entity:       effectiveTender(je, l),
      }));

      // P&L side = Income/Expense lines on this JE; BS side = Asset/Liability lines
      const pnlAmt = entries.filter((e) => e.account_type === "Income"  || e.account_type === "Expense")
                            .reduce((s, e) => s + e.amount, 0) / 2;  // Dr+Cr double-count
      const bsAmt  = entries.filter((e) => e.account_type === "Asset"   || e.account_type === "Liability")
                            .reduce((s, e) => s + e.amount, 0) / 2;

      pnl_elim += pnlAmt;
      bs_elim  += bsAmt;

      hits.push({
        je_no:        je.je_no,
        je_date:      je.je_date,
        narration:    je.narration,
        amount:       r2(je.total_debit),
        entities:     Array.from(tenderSet),
        pnl_elim:     r2(pnlAmt),
        bs_elim:      r2(bsAmt),
        lines:        entries,
      });
    }

    const total_to_eliminate = r2(pnl_elim + bs_elim);
    return {
      financial_year: fy,
      count:            hits.length,
      pnl_elimination:  r2(pnl_elim),
      bs_elimination:   r2(bs_elim),
      total_to_eliminate,
      hits,
    };
    } catch (error) {
      throw error;
    }
  }

  // Internal: build elimination maps keyed by account_code (one pass).
  // Used by pnl() and balanceSheet() to subtract inter-entity amounts.
  static async _elimMap({ from_date, to_date }) {
    try {
    const q = { status: "approved" };
    if (from_date || to_date) {
      q.je_date = {};
      if (from_date) q.je_date.$gte = new Date(from_date);
      if (to_date) {
        const to = new Date(to_date); to.setHours(23, 59, 59, 999);
        q.je_date.$lte = to;
      }
    }
    const jes = await JournalEntryModel.find(q)
      .select("lines tender_id").limit(10000).lean();

    const codes = [...new Set(jes.flatMap((j) => j.lines.map((l) => l.account_code)))];
    const accs  = await AccountTreeModel.find({ account_code: { $in: codes } })
      .select("account_code account_type").lean();
    const typeOf = Object.fromEntries(accs.map((a) => [a.account_code, a.account_type]));

    const pnlByAccount = {};
    const bsByAccount  = {};
    let pnlTotal = 0, bsTotal = 0;

    for (const je of jes) {
      const entsOnJe = new Set(je.lines.map((l) => effectiveTender(je, l)));
      if (entsOnJe.size <= 1) continue;

      for (const l of je.lines) {
        const t   = typeOf[l.account_code] || "";
        const amt = r2((l.debit_amt || 0) + (l.credit_amt || 0));   // either Dr or Cr > 0
        // Each JE line is counted once; eliminating a "receivable" balance means
        // subtracting its net Dr-positive balance, so we mark the amount as
        // debit−credit (signed).
        const signed = r2((l.debit_amt || 0) - (l.credit_amt || 0));
        if (t === "Income" || t === "Expense") {
          pnlByAccount[l.account_code] = r2((pnlByAccount[l.account_code] || 0) + amt);
          pnlTotal += amt / 2;     // each JE has matching Dr/Cr → divide pairs
        } else if (t === "Asset" || t === "Liability") {
          bsByAccount[l.account_code] = r2((bsByAccount[l.account_code] || 0) + signed);
          bsTotal += amt / 2;
        }
      }
    }
    return { pnlByAccount, bsByAccount, pnlTotal: r2(pnlTotal), bsTotal: r2(bsTotal) };
    } catch (error) {
      throw error;
    }
  }
}

export default ConsolidationService;
