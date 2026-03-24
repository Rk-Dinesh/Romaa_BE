import LedgerEntryModel from "./ledger.model.js";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Running balance helper ────────────────────────────────────────────────────
// Computes cumulative balance from a sorted array of entries.
// Balance logic:
//   credit_amt > 0  →  liability increases  (you owe more)
//   debit_amt  > 0  →  liability decreases  (you owe less)
// Positive balance = outstanding payable (Cr balance)
// Negative balance = supplier owes you (Dr balance — rare)
function attachRunningBalance(entries) {
  let running = 0;
  return entries.map((e) => {
    running = round2(running + e.credit_amt - e.debit_amt);
    return { ...e, balance: running };
  });
}

// ── Service ───────────────────────────────────────────────────────────────────

class LedgerService {

  // ── Internal: called by PurchaseBill, WeeklyBill, CN, DN, Payment services ──
  // Not exposed as an HTTP endpoint — auto-posts when a voucher is approved/created.
  static async postEntry(data) {
    const required = ["supplier_type", "supplier_id", "vch_date", "vch_type"];
    for (const field of required) {
      if (!data[field]) throw new Error(`postEntry: '${field}' is required`);
    }
    return await LedgerEntryModel.create(data);
  }

  // ── GET /ledger/supplier/:supplierId ─────────────────────────────────────────
  // Full transaction register for one supplier with running balance.
  // Optional filters: supplier_type, tender_id, vch_type, from_date, to_date
  static async getSupplierLedger(supplierId, filters = {}) {
    const query = { supplier_id: supplierId };

    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.vch_type)      query.vch_type      = filters.vch_type;

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

    return attachRunningBalance(entries);
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
          supplier_name: { $first: "$supplier_name" },
          supplier_type: { $first: "$supplier_type" },
          total_credit:  { $sum: "$credit_amt" },  // total liability raised
          total_debit:   { $sum: "$debit_amt" },   // total liability cleared
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

    return agg ?? {
      supplier_id,
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
          supplier_name: { $first: "$supplier_name" },
          supplier_type: { $first: "$supplier_type" },
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
      // only_outstanding: hide zero-balance suppliers if requested
      ...(filters.only_outstanding
        ? [{ $match: { balance: { $ne: 0 } } }]
        : []),
      { $sort: { balance: -1, last_txn_date: -1 } },
    ]);

    return rows;
  }

  // ── GET /ledger/tender/:tenderId ──────────────────────────────────────────────
  // All ledger entries for a tender — across all suppliers.
  // Optional filters: supplier_id, supplier_type, vch_type, from_date, to_date
  static async getTenderLedger(tenderId, filters = {}) {
    const query = { tender_id: tenderId };

    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.vch_type)      query.vch_type      = filters.vch_type;

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

    // Group by supplier so each supplier has their own running balance
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

    return Object.values(grouped).map((g) => ({
      ...g,
      entries: attachRunningBalance(g.entries),
    }));
  }
}

export default LedgerService;
