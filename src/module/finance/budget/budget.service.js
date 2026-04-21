import BudgetModel from "./budget.model.js";
import JournalEntryModel from "../journalentry/journalentry.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import TenderModel from "../../tender/tender/tender.model.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── FY date helpers ──────────────────────────────────────────────────────────
function fyToDates(fy) {
  // "25-26" → { start: 2025-04-01, end: 2026-03-31 23:59:59 }
  const startYY = parseInt(fy.split("-")[0], 10);
  const century = new Date().getFullYear() >= 2100 ? 2100 : 2000;
  const start = new Date(century + startYY, 3, 1, 0, 0, 0, 0);
  const end   = new Date(century + startYY + 1, 2, 31, 23, 59, 59, 999);
  return { start, end };
}

function quarterDates(fy, qLabel) {
  // FY-aligned quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  const { start } = fyToDates(fy);
  const startMonth = start.getMonth();
  const qOffset = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 }[qLabel];
  if (qOffset === undefined) throw new Error(`Invalid quarter label '${qLabel}' (expected Q1/Q2/Q3/Q4)`);
  const qStart = new Date(start.getFullYear(), startMonth + qOffset, 1, 0, 0, 0, 0);
  const qEnd   = new Date(start.getFullYear(), startMonth + qOffset + 3, 0, 23, 59, 59, 999);
  return { start: qStart, end: qEnd };
}

function monthDates(yyyymm) {
  // "2025-04" → { start, end }
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) throw new Error(`Invalid month label '${yyyymm}' (expected YYYY-MM)`);
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end:   new Date(y, m,     0, 23, 59, 59, 999),
  };
}

function lineDateRange(line, fy) {
  switch (line.period) {
    case "annual":    return fyToDates(fy);
    case "quarterly": return quarterDates(fy, line.period_label);
    case "monthly":   return monthDates(line.period_label);
    default: throw new Error(`Unknown period '${line.period}'`);
  }
}

// ── Validate every account is Income or Expense leaf ─────────────────────────
async function validateAccounts(lines) {
  const codes = [...new Set(lines.map(l => l.account_code).filter(Boolean))];
  if (codes.length === 0) throw new Error("Each line needs account_code");
  const accs = await AccountTreeModel.find({ account_code: { $in: codes }, is_deleted: false }).lean();
  const map = Object.fromEntries(accs.map(a => [a.account_code, a]));
  for (const l of lines) {
    const a = map[l.account_code];
    if (!a)                         throw new Error(`Account '${l.account_code}' not found`);
    if (a.is_group)                 throw new Error(`Account '${l.account_code}' is a group, not a leaf`);
    if (!a.is_posting_account)      throw new Error(`Account '${l.account_code}' is not a posting account`);
    if (!["Income", "Expense"].includes(a.account_type)) {
      throw new Error(`Account '${l.account_code}' (${a.account_name}) is type '${a.account_type}'; budget lines must be Income or Expense`);
    }
    l.account_name = a.account_name;
    l.account_type = a.account_type;
  }
  return lines;
}

// ── Aggregate actuals for a given (tender, account, period range) ────────────
//
// Tender match: line-level tender_id OR JE-level tender_id (mirrors P&L logic).
// Sign convention:
//   Expense → actual = Σdebit − Σcredit  (Dr-positive)
//   Income  → actual = Σcredit − Σdebit  (Cr-positive)
async function getActualForLine({ tender_id, account_code, account_type, from, to }) {
  const result = await JournalEntryModel.aggregate([
    {
      $match: {
        status: "approved",
        je_date: { $gte: from, $lte: to },
        $or: [
          { tender_id },
          { "lines.tender_id": tender_id },
        ],
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account_code": account_code,
        $or: [
          { "lines.tender_id": tender_id },
          { "lines.tender_id": "" },           // line inherits header tender
          { "lines.tender_id": { $exists: false } },
        ],
      },
    },
    {
      $group: {
        _id: null,
        dr: { $sum: "$lines.debit_amt" },
        cr: { $sum: "$lines.credit_amt" },
      },
    },
  ]);
  const dr = result[0]?.dr || 0;
  const cr = result[0]?.cr || 0;
  return account_type === "Income" ? r2(cr - dr) : r2(dr - cr);
}

// ── Service ──────────────────────────────────────────────────────────────────
class BudgetService {

  // POST /budget/create
  static async create(payload) {
    if (!payload.tender_id)      throw new Error("tender_id is required");
    if (!payload.financial_year) throw new Error("financial_year is required (e.g. '25-26')");
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      throw new Error("At least one budget line is required");
    }

    const tender = await TenderModel.findOne({ tender_id: payload.tender_id }).lean();
    if (!tender) throw new Error(`Tender '${payload.tender_id}' not found`);

    await validateAccounts(payload.lines);

    const exists = await BudgetModel.findOne({
      tender_id:      payload.tender_id,
      financial_year: payload.financial_year,
    }).lean();
    if (exists) throw new Error(`Budget already exists for tender ${payload.tender_id} FY ${payload.financial_year}`);

    const doc = await BudgetModel.create({
      budget_no:      `BUD/${payload.tender_id}/${payload.financial_year}`,
      tender_id:      payload.tender_id,
      tender_ref:     tender._id,
      tender_name:    tender.tender_name || "",
      financial_year: payload.financial_year,
      lines:          payload.lines,
      narration:      payload.narration  || "",
      created_by:     payload.created_by || "",
    });
    return doc;
  }

  // GET /budget/list
  static async getList(filters = {}) {
    const query = { is_deleted: { $ne: true } };
    if (filters.tender_id)      query.tender_id      = filters.tender_id;
    if (filters.financial_year) query.financial_year = filters.financial_year;
    if (filters.status)         query.status         = filters.status;

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      BudgetModel.find(query)
        .select("budget_no tender_id tender_name financial_year total_budget status createdAt")
        .sort({ financial_year: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BudgetModel.countDocuments(query),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /budget/:id
  static async getById(id) {
    const doc = await BudgetModel.findById(id).lean();
    if (!doc) throw new Error("Budget not found");
    return doc;
  }

  // PATCH /budget/update/:id
  static async update(id, payload) {
    const doc = await BudgetModel.findById(id);
    if (!doc) throw new Error("Budget not found");
    if (doc.status === "approved") throw new Error("Approved budgets cannot be edited; archive and re-create");

    // Optimistic locking: reject stale updates
    if (payload._version !== undefined && doc._version !== payload._version) {
      throw new Error("Document was modified by another user. Please refresh and try again.");
    }

    const allowed = ["lines", "narration"];
    for (const f of allowed) {
      if (payload[f] !== undefined) doc[f] = payload[f];
    }
    if (payload.lines) await validateAccounts(payload.lines);
    await doc.save();
    return doc;
  }

  // PATCH /budget/:id/approve
  static async approve(id, approver = "") {
    const doc = await BudgetModel.findById(id);
    if (!doc) throw new Error("Budget not found");
    if (doc.status === "approved") throw new Error("Budget already approved");
    doc.status      = "approved";
    doc.approved_by = approver;
    doc.approved_at = new Date();
    await doc.save();
    return doc;
  }

  // PATCH /budget/:id/archive
  static async archive(id) {
    const doc = await BudgetModel.findById(id);
    if (!doc) throw new Error("Budget not found");
    doc.status = "archived";
    await doc.save();
    return doc;
  }

  // DELETE /budget/:id
  static async remove(id) {
    const doc = await BudgetModel.findById(id);
    if (!doc) throw new Error("Budget not found");
    if (doc.status === "approved") throw new Error("Cannot delete approved budget; archive instead");
    await doc.deleteOne();
    return { deleted: true, budget_no: doc.budget_no };
  }

  // GET /budget/variance/:id?as_of=
  //
  // Per-line variance report:
  //   { account_code, account_name, account_type, period, period_label,
  //     budget_amount, actual_amount, variance, variance_pct,
  //     status: "under" | "over" | "on_track" }
  //
  // Variance sign:
  //   Expense — over-budget = bad (variance = budget − actual; negative = over)
  //   Income  — over-budget = good (variance = actual − budget; positive = good)
  // We expose `is_favourable` so the FE can colour-code without re-deriving.
  static async varianceReport(id, opts = {}) {
    const doc = await BudgetModel.findById(id).lean();
    if (!doc) throw new Error("Budget not found");

    const asOf = opts.as_of ? new Date(opts.as_of) : new Date();
    asOf.setHours(23, 59, 59, 999);

    const rows = [];
    let totBudgetExp = 0, totActExp = 0;
    let totBudgetInc = 0, totActInc = 0;

    for (const line of doc.lines) {
      const { start, end: rawEnd } = lineDateRange(line, doc.financial_year);
      const end = rawEnd > asOf ? asOf : rawEnd;          // clip to as_of

      // Don't compute actuals for periods that haven't started yet
      const actual = end < start
        ? 0
        : await getActualForLine({
            tender_id:    doc.tender_id,
            account_code: line.account_code,
            account_type: line.account_type,
            from:         start,
            to:           end,
          });

      const budget = Number(line.budget_amount) || 0;
      const isExpense = line.account_type === "Expense";
      const variance     = isExpense ? r2(budget - actual) : r2(actual - budget);
      const variance_pct = budget > 0 ? r2((variance / budget) * 100) : 0;
      const utilisation_pct = budget > 0 ? r2((actual / budget) * 100) : 0;

      let status = "on_track";
      if (isExpense) {
        if (actual > budget)            status = "over";
        else if (actual < budget * 0.9) status = "under";
      } else {
        if (actual < budget * 0.9)      status = "under";
        else if (actual > budget)       status = "over";
      }

      if (isExpense) { totBudgetExp += budget; totActExp += actual; }
      else           { totBudgetInc += budget; totActInc += actual; }

      rows.push({
        line_id:       line._id,
        account_code:  line.account_code,
        account_name:  line.account_name,
        account_type:  line.account_type,
        period:        line.period,
        period_label:  line.period_label,
        period_from:   start,
        period_to:     end,
        budget_amount: r2(budget),
        actual_amount: r2(actual),
        variance,
        variance_pct,
        utilisation_pct,
        status,
        is_favourable: isExpense ? actual <= budget : actual >= budget,
        notes:         line.notes || "",
      });
    }

    return {
      budget_no:      doc.budget_no,
      tender_id:      doc.tender_id,
      tender_name:    doc.tender_name,
      financial_year: doc.financial_year,
      as_of:          asOf,
      rows,
      summary: {
        expense: {
          total_budget: r2(totBudgetExp),
          total_actual: r2(totActExp),
          variance:     r2(totBudgetExp - totActExp),    // +ve = under-spent (good)
          utilisation_pct: totBudgetExp > 0 ? r2((totActExp / totBudgetExp) * 100) : 0,
        },
        income: {
          total_budget: r2(totBudgetInc),
          total_actual: r2(totActInc),
          variance:     r2(totActInc - totBudgetInc),    // +ve = over-earned (good)
          achievement_pct: totBudgetInc > 0 ? r2((totActInc / totBudgetInc) * 100) : 0,
        },
      },
    };
  }

  // GET /budget/variance/by-tender?tender_id=&financial_year=&as_of=
  // Convenience endpoint: variance for a tender's active budget.
  static async varianceByTender({ tender_id, financial_year, as_of }) {
    if (!tender_id || !financial_year) throw new Error("tender_id and financial_year are required");
    const doc = await BudgetModel.findOne({ tender_id, financial_year }).lean();
    if (!doc) throw new Error(`No budget found for tender ${tender_id} FY ${financial_year}`);
    return this.varianceReport(doc._id, { as_of });
  }
}

export default BudgetService;
