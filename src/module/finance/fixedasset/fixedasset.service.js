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

    const doc = await FixedAssetModel.create({
      asset_no,
      asset_name: payload.asset_name,
      category:   payload.category || "Plant & Machinery",
      linked_machinery_id:  payload.linked_machinery_id  || "",
      linked_machinery_ref: payload.linked_machinery_ref || null,
      acquisition_date: new Date(payload.acquisition_date),
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
