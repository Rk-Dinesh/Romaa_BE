import FixedAssetModel from "./fixedasset.model.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import FinanceCounterModel from "../FinanceCounter.model.js";
import logger from "../../../config/logger.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Month helpers ─────────────────────────────────────────────────────────────
function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function firstOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function lastOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Count whole months between two dates inclusive by year-month
function monthDiff(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

// ── Depreciation math ─────────────────────────────────────────────────────────
// SLM: monthly charge = (cost − salvage) / useful_life_months
// WDV: monthly charge = book_value × (wdv_rate_pct / 100 / 12)
// Never depreciate below salvage_value.
function computeMonthlyCharge(asset) {
  const cost     = Number(asset.acquisition_cost) || 0;
  const salvage  = Number(asset.salvage_value)    || 0;
  const accumDep = Number(asset.accumulated_depreciation) || 0;
  const nbv      = cost - accumDep;
  const floor    = salvage;
  const maxAllowed = Math.max(0, r2(nbv - floor));

  if (maxAllowed <= 0) return 0;

  let charge = 0;
  if (asset.depreciation_method === "SLM") {
    const life = Number(asset.useful_life_months) || 0;
    if (life <= 0) return 0;
    charge = (cost - salvage) / life;
  } else if (asset.depreciation_method === "WDV") {
    const ratePct = Number(asset.wdv_rate_pct) || 0;
    if (ratePct <= 0) return 0;
    charge = nbv * (ratePct / 100) / 12;
  }

  return r2(Math.min(charge, maxAllowed));
}

// ── Validate accounts exist in COA ────────────────────────────────────────────
async function validateAccounts(assetCode, accDepCode, expCode) {
  const codes = [assetCode, accDepCode, expCode];
  const accounts = await AccountTreeModel.find({
    account_code: { $in: codes },
    is_deleted: false,
  }, { account_code: 1, is_posting_account: 1, is_group: 1 }).lean();

  const map = {};
  for (const a of accounts) map[a.account_code] = a;

  for (const c of codes) {
    if (!map[c]) throw new Error(`Account '${c}' not found in Chart of Accounts`);
    if (!map[c].is_posting_account || map[c].is_group) {
      throw new Error(`Account '${c}' is not a posting account`);
    }
  }
}

class FixedAssetService {
  // ── Sequence ────────────────────────────────────────────────────────────
  static async getNextAssetNo() {
    const counter = await FinanceCounterModel.findByIdAndUpdate(
      "FA",
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
    return `FA/${String(counter.seq).padStart(4, "0")}`;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────
  static async create(payload) {
    if (!payload.asset_name)         throw new Error("asset_name is required");
    if (!payload.acquisition_date)   throw new Error("acquisition_date is required");
    if (!(payload.acquisition_cost > 0)) throw new Error("acquisition_cost must be > 0");
    if (!payload.asset_account_code) throw new Error("asset_account_code is required");
    if (!payload.accumulated_depreciation_account_code) throw new Error("accumulated_depreciation_account_code is required");
    if (!payload.depreciation_expense_account_code)    throw new Error("depreciation_expense_account_code is required");

    const method = payload.depreciation_method || "SLM";
    if (method === "SLM" && !(payload.useful_life_months > 0)) {
      throw new Error("useful_life_months is required for SLM depreciation");
    }
    if (method === "WDV" && !(payload.wdv_rate_pct > 0)) {
      throw new Error("wdv_rate_pct is required for WDV depreciation");
    }

    await validateAccounts(
      payload.asset_account_code,
      payload.accumulated_depreciation_account_code,
      payload.depreciation_expense_account_code,
    );

    const asset_no = await FixedAssetService.getNextAssetNo();

    // ── IT-Act parallel book defaults ────────────────────────────────────
    // Half-year rule: if put-to-use date < 180 days before FY-end (31-Mar)
    // of the acquisition year, claim only 50% of the year's rate.
    const acqDate = new Date(payload.acquisition_date);
    const fyEnd   = new Date(acqDate.getMonth() >= 3 ? acqDate.getFullYear() + 1 : acqDate.getFullYear(), 2, 31);
    const daysToFyEnd = Math.floor((fyEnd - acqDate) / (1000 * 60 * 60 * 24));
    const halfYearRule = payload.it_acquired_in_year_half !== undefined
      ? Boolean(payload.it_acquired_in_year_half)
      : daysToFyEnd < 180;

    const doc = await FixedAssetModel.create({
      asset_no,
      asset_name: payload.asset_name,
      category:   payload.category || "Plant & Machinery",
      linked_machinery_id:  payload.linked_machinery_id  || "",
      linked_machinery_ref: payload.linked_machinery_ref || null,
      acquisition_date: acqDate,
      acquisition_cost: r2(payload.acquisition_cost),
      salvage_value:    r2(payload.salvage_value || 0),
      depreciation_method: method,
      useful_life_months:  Number(payload.useful_life_months) || 0,
      wdv_rate_pct:        Number(payload.wdv_rate_pct) || 0,
      asset_account_code:                     payload.asset_account_code,
      accumulated_depreciation_account_code:  payload.accumulated_depreciation_account_code,
      depreciation_expense_account_code:      payload.depreciation_expense_account_code,
      tender_id:   payload.tender_id  || "",
      tender_ref:  payload.tender_ref || null,
      tender_name: payload.tender_name || "",
      accumulated_depreciation: 0,
      book_value: r2(payload.acquisition_cost),
      // IT-Act shadow ledger
      it_block:                 payload.it_block || "Plant & Machinery-General",
      it_rate_pct:              Number(payload.it_rate_pct) || 15,
      it_acquired_in_year_half: halfYearRule,
      it_accumulated_depreciation: 0,
      it_book_value:            r2(payload.acquisition_cost),
      it_last_depreciation_fy:  "",
      it_depreciation_history:  [],
      narration:  payload.narration || "",
      created_by: payload.created_by || "",
    });

    return doc;
  }

  static async getList({ page = 1, limit = 50, status, category, tender_id, q } = {}) {
    const filter = {};
    if (status)    filter.status   = status;
    if (category)  filter.category = category;
    if (tender_id) filter.tender_id = tender_id;
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ asset_no: rx }, { asset_name: rx }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      FixedAssetModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      FixedAssetModel.countDocuments(filter),
    ]);

    return { rows, total, page: Number(page), limit: Number(limit) };
  }

  static async getById(id) {
    const doc = await FixedAssetModel.findById(id).lean();
    if (!doc) throw new Error("Fixed asset not found");
    return doc;
  }

  static async update(id, payload) {
    const doc = await FixedAssetModel.findById(id);
    if (!doc) throw new Error("Fixed asset not found");
    if (doc.status === "disposed") throw new Error("Cannot update a disposed asset");

    // Only safe fields are updatable after creation — cost/method changes
    // would require a reset of history, which this method doesn't do.
    const ALLOWED = [
      "asset_name", "category", "linked_machinery_id", "linked_machinery_ref",
      "tender_id", "tender_ref", "tender_name", "narration",
    ];
    for (const k of ALLOWED) {
      if (payload[k] !== undefined) doc[k] = payload[k];
    }
    await doc.save();
    return doc.toObject();
  }

  static async archive(id) {
    const doc = await FixedAssetModel.findById(id);
    if (!doc) throw new Error("Fixed asset not found");
    doc.status = "archived";
    await doc.save();
    return doc.toObject();
  }

  // ── Post monthly depreciation for ONE asset ────────────────────────────
  // periodDate: any date within the target month. Computes charge, posts JE,
  // appends history, updates accumulated_depreciation & book_value.
  // Returns { skipped, reason? } if nothing was posted.
  static async postDepreciationForAsset(asset, periodDate) {
    const period_start = firstOfMonth(periodDate);
    const period_end   = lastOfMonth(periodDate);
    const period_label = monthKey(periodDate);

    // Skip if asset not active
    if (asset.status !== "active") {
      return { skipped: true, reason: `status=${asset.status}` };
    }
    // Skip if before acquisition month
    if (period_end < firstOfMonth(asset.acquisition_date)) {
      return { skipped: true, reason: "period_before_acquisition" };
    }
    // Skip if already posted for this period
    const already = (asset.depreciation_history || []).some(h => h.period_label === period_label);
    if (already) {
      return { skipped: true, reason: "already_posted" };
    }

    const charge = computeMonthlyCharge(asset);
    if (charge <= 0) {
      return { skipped: true, reason: "zero_charge" };
    }

    const openingNbv = r2((asset.acquisition_cost || 0) - (asset.accumulated_depreciation || 0));
    const closingNbv = r2(openingNbv - charge);

    const lines = [
      {
        account_code: asset.depreciation_expense_account_code,
        dr_cr: "Dr",
        debit_amt:  charge,
        credit_amt: 0,
        narration:  `Depreciation ${period_label} — ${asset.asset_no}`,
        tender_id:  asset.tender_id || "",
      },
      {
        account_code: asset.accumulated_depreciation_account_code,
        dr_cr: "Cr",
        debit_amt:  0,
        credit_amt: charge,
        narration:  `Accum. depreciation ${period_label} — ${asset.asset_no}`,
        tender_id:  asset.tender_id || "",
      },
    ];

    const je = await JournalEntryService.createFromVoucher(lines, {
      je_date:     period_end,
      je_type:     "Depreciation",
      narration:   `Depreciation for ${asset.asset_no} (${asset.asset_name}) — ${period_label}`,
      tender_id:   asset.tender_id || "",
      tender_ref:  asset.tender_ref || null,
      tender_name: asset.tender_name || "",
      source_type: "FixedAsset",
      source_ref:  asset._id,
      source_no:   asset.asset_no,
    });

    if (!je) {
      return { skipped: true, reason: "je_creation_failed" };
    }

    // Mutate & save the asset
    const fresh = await FixedAssetModel.findById(asset._id);
    if (!fresh) return { skipped: true, reason: "asset_not_found" };

    fresh.accumulated_depreciation = r2((fresh.accumulated_depreciation || 0) + charge);
    fresh.last_depreciation_date = period_end;
    fresh.depreciation_history.push({
      period_label,
      period_start,
      period_end,
      method:      fresh.depreciation_method,
      amount:      charge,
      opening_nbv: openingNbv,
      closing_nbv: closingNbv,
      je_ref:      je._id,
      je_no:       je.je_no,
      posted_at:   new Date(),
    });
    await fresh.save();

    return {
      skipped: false,
      asset_no: fresh.asset_no,
      charge,
      je_no: je.je_no,
      closing_nbv: r2((fresh.acquisition_cost || 0) - (fresh.accumulated_depreciation || 0)),
    };
  }

  // ── Batch: post depreciation for ALL active assets for a given period ──
  // Used by the monthly cron. Safe to re-run — assets that already have
  // a history row for that period are skipped.
  static async postMonthlyDepreciation({ period_date } = {}) {
    const targetDate = period_date ? new Date(period_date) : new Date();

    const assets = await FixedAssetModel.find({ status: "active" }).lean();
    let posted = 0, skipped = 0, failed = 0;
    const details = [];

    for (const a of assets) {
      try {
        const r = await FixedAssetService.postDepreciationForAsset(a, targetDate);
        if (r.skipped) { skipped++; details.push({ asset_no: a.asset_no, ...r }); }
        else           { posted++;  details.push({ asset_no: a.asset_no, ...r }); }
      } catch (err) {
        failed++;
        logger.error(`[FixedAsset] depreciation failed for ${a.asset_no}: ${err.message}`);
        details.push({ asset_no: a.asset_no, skipped: true, reason: "error", error: err.message });
      }
    }

    return { period: monthKey(targetDate), posted, skipped, failed, details };
  }

  // ══════════════════════════════════════════════════════════════════════
  // INCOME TAX ACT — §32 BLOCK-OF-ASSETS WDV DEPRECIATION (shadow ledger)
  // ──────────────────────────────────────────────────────────────────────
  // The IT-Act book runs in PARALLEL to the Companies Act book and posts
  // NO journal entries. Differences between the two books are reconciled
  // at year-end via the deferred tax provision in the income tax return.
  //
  // Computation rules:
  //   • Method: WDV (mandatory under §32)
  //   • Cycle:  Annual (no monthly accrual)
  //   • Rate:   `it_rate_pct` (default per IT_BLOCKS recommendation)
  //   • Half-year rule: if `it_acquired_in_year_half=true`, charge only
  //     50% of the rate IN THE ACQUISITION YEAR ONLY (full rate every
  //     year thereafter).
  //   • FY format: "YY-YY" (e.g. "25-26" → 1-Apr-2025 to 31-Mar-2026)
  // ══════════════════════════════════════════════════════════════════════

  static fyToYearStart(fy) {
    // "25-26" → 2025
    const [a] = String(fy).split("-");
    if (!/^\d{2}$/.test(a)) throw new Error(`Invalid financial_year '${fy}' (expected YY-YY e.g. "25-26")`);
    return 2000 + parseInt(a, 10);
  }

  // Post IT depreciation for ONE asset for ONE financial year.
  // Idempotent: skips if already posted for that FY.
  static async postItDepreciationForAsset(asset, financial_year) {
    if (!financial_year) throw new Error("financial_year is required (e.g. '25-26')");

    if (asset.status === "disposed") {
      return { skipped: true, reason: "asset_disposed" };
    }

    const fyStartYear = FixedAssetService.fyToYearStart(financial_year);
    const fyEnd       = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999);
    const acqDate     = new Date(asset.acquisition_date);

    if (acqDate > fyEnd) {
      return { skipped: true, reason: "acquired_after_fy" };
    }

    const already = (asset.it_depreciation_history || []).some(h => h.financial_year === financial_year);
    if (already) return { skipped: true, reason: "already_posted" };

    const openingWdv = r2(asset.it_book_value || 0);
    if (openingWdv <= 0.01) return { skipped: true, reason: "wdv_zero" };

    const acqFy = acqDate.getMonth() >= 3 ? acqDate.getFullYear() : acqDate.getFullYear() - 1;
    const isAcquisitionFy = acqFy === fyStartYear;
    const halfRate = Boolean(asset.it_acquired_in_year_half) && isAcquisitionFy;

    const ratePct = Number(asset.it_rate_pct) || 0;
    if (ratePct <= 0) return { skipped: true, reason: "zero_rate" };

    const annualRate = halfRate ? ratePct / 2 : ratePct;
    const charge = r2(openingWdv * (annualRate / 100));
    if (charge <= 0) return { skipped: true, reason: "zero_charge" };

    const closingWdv = r2(openingWdv - charge);

    const fresh = await FixedAssetModel.findById(asset._id);
    if (!fresh) return { skipped: true, reason: "asset_not_found" };

    fresh.it_accumulated_depreciation = r2((fresh.it_accumulated_depreciation || 0) + charge);
    fresh.it_book_value = closingWdv;
    fresh.it_last_depreciation_fy = financial_year;
    fresh.it_depreciation_history.push({
      financial_year,
      opening_wdv:       openingWdv,
      additions:         0,
      deletions:         0,
      rate_pct:          ratePct,
      half_rate_applied: halfRate,
      depreciation:      charge,
      closing_wdv:       closingWdv,
      posted_at:         new Date(),
    });
    await fresh.save();

    return {
      skipped: false,
      asset_no: fresh.asset_no,
      financial_year,
      opening_wdv: openingWdv,
      rate_pct: ratePct,
      half_rate_applied: halfRate,
      depreciation: charge,
      closing_wdv: closingWdv,
    };
  }

  // Batch: post IT-Act depreciation for ALL non-disposed assets for a FY.
  static async postItDepreciationForAllAssets({ financial_year } = {}) {
    if (!financial_year) throw new Error("financial_year is required (e.g. '25-26')");

    const assets = await FixedAssetModel.find({ status: { $ne: "disposed" } }).lean();
    let posted = 0, skipped = 0, failed = 0;
    const details = [];

    for (const a of assets) {
      try {
        const r = await FixedAssetService.postItDepreciationForAsset(a, financial_year);
        if (r.skipped) { skipped++; details.push({ asset_no: a.asset_no, ...r }); }
        else           { posted++;  details.push({ asset_no: a.asset_no, ...r }); }
      } catch (err) {
        failed++;
        logger.error(`[FixedAsset] IT depreciation failed for ${a.asset_no}: ${err.message}`);
        details.push({ asset_no: a.asset_no, skipped: true, reason: "error", error: err.message });
      }
    }

    return { financial_year, posted, skipped, failed, details };
  }

  // Side-by-side Companies Act vs IT-Act report.
  // Returns per-asset cost/dep/NBV under both books, plus aggregate
  // book_vs_tax_difference (a positive value means deferred tax LIABILITY,
  // negative means deferred tax ASSET — actual DTL/DTA computation is
  // outside this report).
  static async getDualDepreciationReport({ financial_year, as_of_date, category, status } = {}) {
    const asOf = as_of_date ? new Date(as_of_date) : new Date();

    const filter = {};
    if (status)   filter.status   = status;
    if (category) filter.category = category;

    const assets = await FixedAssetModel.find(filter).sort({ acquisition_date: 1 }).lean();

    let coTotalCost = 0, coTotalAccDep = 0, coTotalNbv = 0;
    let itTotalCost = 0, itTotalAccDep = 0, itTotalWdv = 0;
    const rows = [];

    for (const a of assets) {
      const cost = r2(a.acquisition_cost || 0);

      // Companies Act NBV — sum history rows up to as_of_date
      const coAccDep = r2((a.depreciation_history || [])
        .filter(h => h.period_end && new Date(h.period_end) <= asOf)
        .reduce((s, h) => s + (h.amount || 0), 0));
      const coNbv = r2(cost - coAccDep);

      // IT-Act WDV — sum history rows up to (and including) financial_year if given,
      // otherwise use the asset's running it_book_value.
      let itAccDep, itWdv, itLastFy;
      if (financial_year) {
        const upto = (a.it_depreciation_history || []).filter(h => h.financial_year <= financial_year);
        itAccDep = r2(upto.reduce((s, h) => s + (h.depreciation || 0), 0));
        itWdv    = r2(cost - itAccDep);
        itLastFy = upto.length ? upto[upto.length - 1].financial_year : "";
      } else {
        itAccDep = r2(a.it_accumulated_depreciation || 0);
        itWdv    = r2(a.it_book_value || cost);
        itLastFy = a.it_last_depreciation_fy || "";
      }

      coTotalCost   += cost;       coTotalAccDep += coAccDep; coTotalNbv += coNbv;
      itTotalCost   += cost;       itTotalAccDep += itAccDep; itTotalWdv += itWdv;

      rows.push({
        asset_no:   a.asset_no,
        asset_name: a.asset_name,
        category:   a.category,
        acquisition_date: a.acquisition_date,
        acquisition_cost: cost,
        // Companies Act book
        co_method:        a.depreciation_method,
        co_rate_or_life:  a.depreciation_method === "SLM"
                            ? `${a.useful_life_months} months`
                            : `${a.wdv_rate_pct}% WDV`,
        co_accumulated_depreciation: coAccDep,
        co_net_book_value:           coNbv,
        // IT-Act book
        it_block:          a.it_block || "",
        it_rate_pct:       a.it_rate_pct || 0,
        it_half_year_rule: Boolean(a.it_acquired_in_year_half),
        it_last_fy:        itLastFy,
        it_accumulated_depreciation: itAccDep,
        it_book_value:               itWdv,
        // Delta — difference between book NBV and tax WDV
        // +ve  → book NBV > tax WDV  → tax dep faster → DTL
        // -ve  → book NBV < tax WDV  → book dep faster → DTA
        book_vs_tax_difference: r2(coNbv - itWdv),
        status: a.status,
      });
    }

    const totalDifference = r2(coTotalNbv - itTotalWdv);

    return {
      as_of: asOf,
      financial_year: financial_year || null,
      rows,
      totals: {
        asset_count: rows.length,
        total_cost:  r2(coTotalCost),
        companies_act: {
          accumulated_depreciation: r2(coTotalAccDep),
          net_book_value:           r2(coTotalNbv),
        },
        income_tax_act: {
          accumulated_depreciation: r2(itTotalAccDep),
          written_down_value:       r2(itTotalWdv),
        },
        book_vs_tax_difference: totalDifference,
        deferred_tax_indicator: totalDifference > 0 ? "DTL"
                              : totalDifference < 0 ? "DTA"
                              : "NIL",
      },
      notes: [
        "IT-Act book tracks Section 32 block-of-assets WDV depreciation in parallel.",
        "No journal entries are posted for IT-Act depreciation — this is a shadow ledger.",
        "Book-vs-tax differences should be reconciled via deferred tax (AS 22 / Ind AS 12) at year-end.",
        "Half-year rule: assets put-to-use < 180 days in acquisition year claim 50% rate that FY only.",
      ],
    };
  }

  // ── Dispose an asset ────────────────────────────────────────────────────
  // Books the disposal: removes cost + accumulated depreciation, records
  // gain/loss on sale, and marks the asset disposed.
  //
  // JE shape (sold for cash):
  //   Dr Accumulated Depreciation (remove)
  //   Dr Cash/Bank (disposal proceeds)
  //   Dr Loss on Sale (if loss)          OR   Cr Gain on Sale (if gain)
  //   Cr Asset at cost                   (remove)
  //
  // This method posts the JE without a cash/bank line — callers should
  // record the cash receipt via a separate ReceiptVoucher if applicable.
  // We only post: Dr AccDep + Dr/Cr Loss/Gain, Cr Asset, (and if disposal
  // proceeds > 0, we post Dr Cash at configured cash_account_code.)
  static async dispose({ id, disposal_date, disposal_amount, cash_account_code, gain_loss_account_code, notes = "" }) {
    const asset = await FixedAssetModel.findById(id);
    if (!asset) throw new Error("Fixed asset not found");
    if (asset.status === "disposed") throw new Error("Asset is already disposed");

    const proceeds = r2(disposal_amount || 0);
    const accDep   = r2(asset.accumulated_depreciation || 0);
    const cost     = r2(asset.acquisition_cost || 0);
    const nbv      = r2(cost - accDep);
    const gainLoss = r2(proceeds - nbv);      // +ve = gain, -ve = loss

    if (proceeds > 0 && !cash_account_code) {
      throw new Error("cash_account_code is required when disposal_amount > 0");
    }
    if (gainLoss !== 0 && !gain_loss_account_code) {
      throw new Error("gain_loss_account_code is required (gain or loss on disposal)");
    }

    const lines = [];
    // Dr Accumulated Depreciation (remove contra balance)
    if (accDep > 0) {
      lines.push({ account_code: asset.accumulated_depreciation_account_code, dr_cr: "Dr", debit_amt: accDep, credit_amt: 0, narration: "Reverse accumulated depreciation" });
    }
    // Dr Cash/Bank (disposal proceeds)
    if (proceeds > 0) {
      lines.push({ account_code: cash_account_code, dr_cr: "Dr", debit_amt: proceeds, credit_amt: 0, narration: "Disposal proceeds" });
    }
    // Cr Asset at cost
    lines.push({ account_code: asset.asset_account_code, dr_cr: "Cr", debit_amt: 0, credit_amt: cost, narration: "Retire asset at cost" });
    // Gain or Loss
    if (gainLoss > 0) {
      lines.push({ account_code: gain_loss_account_code, dr_cr: "Cr", debit_amt: 0, credit_amt: gainLoss, narration: "Gain on disposal" });
    } else if (gainLoss < 0) {
      lines.push({ account_code: gain_loss_account_code, dr_cr: "Dr", debit_amt: -gainLoss, credit_amt: 0, narration: "Loss on disposal" });
    }

    const je = await JournalEntryService.createFromVoucher(lines, {
      je_date:     disposal_date ? new Date(disposal_date) : new Date(),
      je_type:     "Disposal",
      narration:   `Disposal of ${asset.asset_no} (${asset.asset_name})`,
      tender_id:   asset.tender_id || "",
      source_type: "FixedAsset",
      source_ref:  asset._id,
      source_no:   asset.asset_no,
    });

    if (!je) {
      throw new Error(`Disposal JE could not be posted for ${asset.asset_no}. Asset state left unchanged — check Chart of Accounts for cash/gain-loss codes and try again.`);
    }

    asset.disposal = {
      disposal_date:   disposal_date ? new Date(disposal_date) : new Date(),
      disposal_amount: proceeds,
      gain_loss:       gainLoss,
      je_ref:          je._id,
      je_no:           je.je_no,
      notes,
    };
    asset.status = "disposed";
    await asset.save();

    return { asset: asset.toObject(), je_no: je.je_no, gain_loss: gainLoss };
  }

  // ── Asset Register Report ───────────────────────────────────────────────
  // Returns all assets with cost, accumulated depreciation up to the
  // given as_of_date, and derived net book value. Useful for B/S note.
  static async getRegister({ as_of_date, category, status = "active" } = {}) {
    const asOf = as_of_date ? new Date(as_of_date) : new Date();

    const filter = {};
    if (status)   filter.status   = status;
    if (category) filter.category = category;

    const assets = await FixedAssetModel.find(filter).sort({ acquisition_date: 1 }).lean();

    let totalCost = 0, totalAccDep = 0, totalNbv = 0;
    const rows = [];

    for (const a of assets) {
      // Accumulated depreciation up to as_of_date (ignore charges posted after)
      const cutoffAcc = (a.depreciation_history || [])
        .filter(h => h.period_end && new Date(h.period_end) <= asOf)
        .reduce((s, h) => s + (h.amount || 0), 0);
      const cost = r2(a.acquisition_cost || 0);
      const accDep = r2(cutoffAcc);
      const nbv = r2(cost - accDep);

      totalCost   += cost;
      totalAccDep += accDep;
      totalNbv    += nbv;

      rows.push({
        asset_no:            a.asset_no,
        asset_name:          a.asset_name,
        category:            a.category,
        acquisition_date:    a.acquisition_date,
        acquisition_cost:    cost,
        accumulated_depreciation: accDep,
        net_book_value:      nbv,
        depreciation_method: a.depreciation_method,
        useful_life_months:  a.useful_life_months,
        wdv_rate_pct:        a.wdv_rate_pct,
        status:              a.status,
        tender_id:           a.tender_id || "",
        tender_name:         a.tender_name || "",
      });
    }

    return {
      as_of:  asOf,
      rows,
      totals: {
        total_cost: r2(totalCost),
        total_accumulated_depreciation: r2(totalAccDep),
        total_net_book_value: r2(totalNbv),
        asset_count: rows.length,
      },
    };
  }

  // ── Future depreciation schedule for ONE asset ─────────────────────────
  // Projects monthly charges going forward until book value reaches salvage.
  // Useful for cashflow planning & tax forecasts.
  static async getSchedule(id, { max_months = 120 } = {}) {
    const asset = await FixedAssetModel.findById(id).lean();
    if (!asset) throw new Error("Fixed asset not found");

    const cost    = Number(asset.acquisition_cost) || 0;
    const salvage = Number(asset.salvage_value)    || 0;
    let nbv       = r2(cost - (asset.accumulated_depreciation || 0));
    const history = asset.depreciation_history || [];
    let cursor    = history.length
      ? new Date(history[history.length - 1].period_end)
      : new Date(asset.acquisition_date);

    const rows = [];
    for (let i = 0; i < max_months && nbv > salvage + 0.01; i++) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const opening = nbv;

      let charge = 0;
      if (asset.depreciation_method === "SLM") {
        const life = Number(asset.useful_life_months) || 0;
        if (life <= 0) break;
        charge = (cost - salvage) / life;
      } else {
        const ratePct = Number(asset.wdv_rate_pct) || 0;
        if (ratePct <= 0) break;
        charge = opening * (ratePct / 100) / 12;
      }
      const maxAllowed = Math.max(0, r2(opening - salvage));
      charge = r2(Math.min(charge, maxAllowed));
      if (charge <= 0) break;

      nbv = r2(opening - charge);
      rows.push({
        period_label: monthKey(cursor),
        period_end:   lastOfMonth(cursor),
        opening_nbv:  opening,
        charge,
        closing_nbv:  nbv,
      });
    }

    return {
      asset_no: asset.asset_no,
      asset_name: asset.asset_name,
      method: asset.depreciation_method,
      current_nbv: r2((asset.acquisition_cost || 0) - (asset.accumulated_depreciation || 0)),
      salvage_value: salvage,
      projected: rows,
      projected_months: rows.length,
    };
  }
}

export default FixedAssetService;
