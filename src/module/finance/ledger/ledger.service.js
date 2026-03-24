import LedgerEntryModel from "./ledger.model.js";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── FY helper ─────────────────────────────────────────────────────────────────
function getFY(date) {
  const d     = new Date(date);
  const month = d.getMonth() + 1;
  const year  = d.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`; // "25-26"
}

// ── Running balance helper ────────────────────────────────────────────────────
// Computes cumulative balance from a sorted array of entries.
// Balance logic:
//   credit_amt > 0  →  liability increases  (you owe more)
//   debit_amt  > 0  →  liability decreases  (you owe less)
// Positive balance = outstanding payable (Cr balance)
// Negative balance = supplier owes you (Dr balance — rare)
//
// startingBalance: opening balance carried forward (used when from_date filter
// excludes earlier entries — avoids the classic "balance resets to 0" bug)
function attachRunningBalance(entries, startingBalance = 0) {
  let running = startingBalance;
  return entries.map((e) => {
    running = round2(running + e.credit_amt - e.debit_amt);
    return { ...e, balance: running };
  });
}

// ── Opening balance B/F row ───────────────────────────────────────────────────
// Synthetic first row shown when a date filter is applied and there are prior entries.
function makeOpeningRow(fromDate, balance) {
  return {
    vch_date:            new Date(fromDate),
    vch_no:              "",
    vch_type:            "Journal",
    particulars:         "Opening Balance B/F",
    tender_id:           "",
    tender_name:         "",
    debit_amt:           balance < 0 ? round2(Math.abs(balance)) : 0,
    credit_amt:          balance > 0 ? balance : 0,
    balance,
    is_opening_balance:  true,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

class LedgerService {

  // ── Internal: called by PurchaseBill, WeeklyBill, CN, DN, PV, RV services ──
  // Not exposed as an HTTP endpoint — auto-posts when a voucher is approved.
  static async postEntry(data) {
    // Required field validation
    const required = ["supplier_type", "supplier_id", "vch_date", "vch_type"];
    for (const field of required) {
      if (!data[field]) throw new Error(`postEntry: '${field}' is required`);
    }

    // Double-entry sanity: exactly one side should be > 0 (the other must be 0).
    // Journal entries may have either side populated, so we only enforce for non-Journal.
    const dr = Number(data.debit_amt)  || 0;
    const cr = Number(data.credit_amt) || 0;
    if (data.vch_type !== "Journal" && dr > 0 && cr > 0) {
      throw new Error(
        `postEntry: both debit_amt (${dr}) and credit_amt (${cr}) are > 0 for ${data.vch_type}. ` +
        `A single ledger line must be either Dr or Cr, not both.`
      );
    }

    // Duplicate protection: if a voucher ref is supplied, ensure we haven't already posted it.
    if (data.vch_ref) {
      const existing = await LedgerEntryModel.findOne({
        vch_ref:  data.vch_ref,
        vch_type: data.vch_type,
      }).lean();
      if (existing) {
        throw new Error(
          `postEntry: duplicate — ledger entry for ${data.vch_type} ${data.vch_no || data.vch_ref} already exists`
        );
      }
    }

    // Auto-set financial year from voucher date
    const financial_year = getFY(data.vch_date);

    return await LedgerEntryModel.create({ ...data, financial_year });
  }

  // ── GET /ledger/supplier/:supplierId ─────────────────────────────────────────
  // Full transaction register for one supplier with running balance.
  // When from_date is supplied, row 1 is "Opening Balance B/F" carrying forward
  // the balance of all entries before from_date — standard accounting practice.
  // Optional filters: supplier_type, tender_id, vch_type, from_date, to_date
  static async getSupplierLedger(supplierId, filters = {}) {
    const query = { supplier_id: supplierId };

    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.vch_type)      query.vch_type      = filters.vch_type;

    // ── Opening Balance B/F ───────────────────────────────────────────────
    // When from_date is set, compute the balance of all entries BEFORE that date.
    // This becomes the starting balance for the running total — the classic B/F row.
    let openingBalance = 0;
    if (filters.from_date) {
      const preMatch = { supplier_id: supplierId };
      if (filters.supplier_type) preMatch.supplier_type = filters.supplier_type;
      if (filters.tender_id)     preMatch.tender_id     = filters.tender_id;
      preMatch.vch_date = { $lt: new Date(filters.from_date) };

      const [preAgg] = await LedgerEntryModel.aggregate([
        { $match: preMatch },
        { $group: { _id: null, cr: { $sum: "$credit_amt" }, dr: { $sum: "$debit_amt" } } },
      ]);
      if (preAgg) {
        openingBalance = round2(preAgg.cr - preAgg.dr);
      }
    }

    // Date range for the main query
    if (filters.from_date || filters.to_date) {
      query.vch_date = {};
      if (filters.from_date) query.vch_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.vch_date.$lte = to;
      }
    }

    const entries = await LedgerEntryModel.find(query)
      .sort({ vch_date: 1, createdAt: 1 })
      .lean();

    const rows = attachRunningBalance(entries, openingBalance);

    // Prepend Opening Balance B/F row when a date filter is active and there's a prior balance
    if (filters.from_date && openingBalance !== 0) {
      rows.unshift(makeOpeningRow(filters.from_date, openingBalance));
    }

    return rows;
  }

  // ── GET /ledger/balance/:supplierId ──────────────────────────────────────────
  // Current outstanding balance for one supplier.
  // Optional filter: tender_id (balance scoped to a tender)
  static async getSupplierBalance(supplierId, filters = {}) {
    const match = { supplier_id: supplierId };
    if (filters.supplier_type) match.supplier_type = filters.supplier_type;
    if (filters.tender_id)     match.tender_id     = filters.tender_id;

    const [agg] = await LedgerEntryModel.aggregate([
      { $match: match },
      {
        $group: {
          _id:           null,
          supplier_name: { $last: "$supplier_name" },  // $last = most recent snapshot
          supplier_type: { $last: "$supplier_type" },
          total_credit:  { $sum: "$credit_amt" },
          total_debit:   { $sum: "$debit_amt" },
        },
      },
      {
        $project: {
          _id:           0,
          supplier_name: 1,
          supplier_type: 1,
          total_credit:  { $round: ["$total_credit", 2] },
          total_debit:   { $round: ["$total_debit",  2] },
          balance: {
            $round: [{ $subtract: ["$total_credit", "$total_debit"] }, 2],
          },
        },
      },
    ]);

    return agg
      ? { supplier_id: supplierId, ...agg }  // supplier_id always present in result
      : {
          supplier_id:   supplierId,
          supplier_name: "",
          supplier_type: filters.supplier_type ?? "",
          total_credit:  0,
          total_debit:   0,
          balance:       0,
        };
  }

  // ── GET /ledger/summary ───────────────────────────────────────────────────────
  // One row per supplier — outstanding balance across all tenders.
  // Optional filters: supplier_type ("Vendor" | "Contractor"), only_outstanding (boolean)
  static async getAllSupplierBalances(filters = {}) {
    const match = {};
    if (filters.supplier_type) match.supplier_type = filters.supplier_type;

    const rows = await LedgerEntryModel.aggregate([
      { $match: match },
      {
        $group: {
          _id:           "$supplier_id",
          supplier_name: { $last: "$supplier_name" },  // $last = most recent snapshot
          supplier_type: { $last: "$supplier_type" },
          total_credit:  { $sum: "$credit_amt" },
          total_debit:   { $sum: "$debit_amt" },
          last_txn_date: { $max: "$vch_date" },
        },
      },
      {
        $project: {
          _id:           0,
          supplier_id:   "$_id",
          supplier_name: 1,
          supplier_type: 1,
          total_credit:  { $round: ["$total_credit", 2] },
          total_debit:   { $round: ["$total_debit",  2] },
          balance: {
            $round: [{ $subtract: ["$total_credit", "$total_debit"] }, 2],
          },
          last_txn_date: 1,
        },
      },
      ...(filters.only_outstanding
        ? [{ $match: { balance: { $ne: 0 } } }]
        : []),
      { $sort: { balance: -1, last_txn_date: -1 } },
    ]);

    return rows;
  }

  // ── GET /ledger/tender/:tenderId ──────────────────────────────────────────────
  // All ledger entries for a tender — across all suppliers, each with running balance.
  // When from_date is supplied, each supplier gets their own Opening Balance B/F row.
  // Optional filters: supplier_id, supplier_type, vch_type, from_date, to_date
  static async getTenderLedger(tenderId, filters = {}) {
    const query = { tender_id: tenderId };

    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.vch_type)      query.vch_type      = filters.vch_type;

    // ── Opening Balance B/F (per supplier) ───────────────────────────────
    // For each supplier in this tender, compute their balance before from_date.
    const openingBalances = {};
    if (filters.from_date) {
      const preMatch = { tender_id: tenderId };
      if (filters.supplier_id)   preMatch.supplier_id   = filters.supplier_id;
      if (filters.supplier_type) preMatch.supplier_type = filters.supplier_type;
      preMatch.vch_date = { $lt: new Date(filters.from_date) };

      const preAgg = await LedgerEntryModel.aggregate([
        { $match: preMatch },
        {
          $group: {
            _id: "$supplier_id",
            cr:  { $sum: "$credit_amt" },
            dr:  { $sum: "$debit_amt" },
          },
        },
      ]);
      for (const r of preAgg) {
        openingBalances[r._id] = round2(r.cr - r.dr);
      }
    }

    if (filters.from_date || filters.to_date) {
      query.vch_date = {};
      if (filters.from_date) query.vch_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.vch_date.$lte = to;
      }
    }

    const entries = await LedgerEntryModel.find(query)
      .sort({ vch_date: 1, createdAt: 1 })
      .lean();

    // Group by supplier
    const grouped = {};
    for (const entry of entries) {
      if (!grouped[entry.supplier_id]) {
        grouped[entry.supplier_id] = {
          supplier_id:   entry.supplier_id,
          supplier_name: entry.supplier_name,
          supplier_type: entry.supplier_type,
          entries:       [],
        };
      }
      grouped[entry.supplier_id].entries.push(entry);
    }

    return Object.values(grouped).map((g) => {
      const obv   = openingBalances[g.supplier_id] ?? 0;
      const rows  = attachRunningBalance(g.entries, obv);

      // Prepend B/F row per supplier when a date filter is active
      if (filters.from_date && obv !== 0) {
        rows.unshift(makeOpeningRow(filters.from_date, obv));
      }

      return { ...g, entries: rows };
    });
  }

  // ── GET /ledger/tender-balance/:tenderId ──────────────────────────────────────
  // Single total outstanding balance for an entire tender with a breakdown by type.
  // Useful for project managers: "how much is still owed on TND-001?"
  // Optional filter: supplier_type
  static async getTenderBalance(tenderId, filters = {}) {
    const match = { tender_id: tenderId };
    if (filters.supplier_type) match.supplier_type = filters.supplier_type;

    const BILL_TYPES = ["PurchaseBill", "WeeklyBill"];

    const [agg] = await LedgerEntryModel.aggregate([
      { $match: match },
      {
        $group: {
          _id:            null,
          total_bills:    { $sum: { $cond: [{ $in: ["$vch_type", BILL_TYPES] }, "$credit_amt", 0] } },
          total_cn:       { $sum: { $cond: [{ $eq: ["$vch_type", "CreditNote"] }, "$debit_amt", 0] } },
          total_dn:       { $sum: { $cond: [{ $eq: ["$vch_type", "DebitNote"]  }, "$debit_amt", 0] } },
          total_payments: { $sum: { $cond: [{ $eq: ["$vch_type", "Payment"]    }, "$debit_amt", 0] } },
          total_receipts: { $sum: { $cond: [{ $eq: ["$vch_type", "Receipt"]    }, "$debit_amt", 0] } },
          total_credit:   { $sum: "$credit_amt" },
          total_debit:    { $sum: "$debit_amt" },
        },
      },
      {
        $project: {
          _id:            0,
          total_bills:    { $round: ["$total_bills",    2] },
          total_cn:       { $round: ["$total_cn",       2] },
          total_dn:       { $round: ["$total_dn",       2] },
          total_payments: { $round: ["$total_payments", 2] },
          total_receipts: { $round: ["$total_receipts", 2] },
          total_credit:   { $round: ["$total_credit",   2] },
          total_debit:    { $round: ["$total_debit",    2] },
          balance: {
            $round: [{ $subtract: ["$total_credit", "$total_debit"] }, 2],
          },
        },
      },
    ]);

    return agg ?? {
      tender_id:      tenderId,
      total_bills:    0,
      total_cn:       0,
      total_dn:       0,
      total_payments: 0,
      total_receipts: 0,
      total_credit:   0,
      total_debit:    0,
      balance:        0,
    };
  }

  // ── GET /ledger/statement/:supplierId ─────────────────────────────────────────
  // Payables statement broken down by voucher type — for finance reconciliation.
  // Shows: total bills raised / CNs / DNs / payments / receipts and net balance.
  // Optional filters: supplier_type, tender_id, financial_year
  static async getSupplierStatement(supplierId, filters = {}) {
    const match = { supplier_id: supplierId };
    if (filters.supplier_type)  match.supplier_type  = filters.supplier_type;
    if (filters.tender_id)      match.tender_id      = filters.tender_id;
    if (filters.financial_year) match.financial_year = filters.financial_year;

    const rows = await LedgerEntryModel.aggregate([
      { $match: match },
      {
        $group: {
          _id:          "$vch_type",
          count:        { $sum: 1 },
          total_credit: { $sum: "$credit_amt" },
          total_debit:  { $sum: "$debit_amt" },
          last_date:    { $max: "$vch_date" },
        },
      },
      {
        $project: {
          _id:          0,
          vch_type:     "$_id",
          count:        1,
          total_credit: { $round: ["$total_credit", 2] },
          total_debit:  { $round: ["$total_debit",  2] },
          net: {
            $round: [{ $subtract: ["$total_credit", "$total_debit"] }, 2],
          },
          last_date: 1,
        },
      },
      { $sort: { vch_type: 1 } },
    ]);

    // Overall balance = sum of all Cr minus sum of all Dr
    const balance = round2(
      rows.reduce((acc, r) => acc + r.total_credit - r.total_debit, 0)
    );

    return { supplier_id: supplierId, breakdown: rows, balance };
  }
}

export default LedgerService;
