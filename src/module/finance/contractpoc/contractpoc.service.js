import ContractPOCModel from "./contractpoc.model.js";
import TenderModel from "../../tender/tender/tender.model.js";
import ClientBillingModel from "../clientbilling/clientbilling/clientbilling.model.js";
import JournalEntryModel from "../journalentry/journalentry.model.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

class ContractPOCService {
  // ── Create or update (also logs revisions) ─────────────────────────────────
  static async upsert({ tender_id, contract_value, total_estimated_cost, user_id = "", reason = "" }) {
    if (!tender_id)            throw new Error("tender_id is required");
    if (!(total_estimated_cost > 0)) throw new Error("total_estimated_cost must be > 0");
    if (!(contract_value > 0)) throw new Error("contract_value must be > 0");

    const tender = await TenderModel.findOne({ tender_id }).select("tender_id tender_name").lean();
    if (!tender) throw new Error(`Tender ${tender_id} not found`);

    const existing = await ContractPOCModel.findOne({ tender_id });
    if (existing) {
      // Log revision if estimate changed
      if (existing.total_estimated_cost !== total_estimated_cost) {
        existing.history.push({
          revised_by:              user_id,
          previous_total_est_cost: existing.total_estimated_cost,
          new_total_est_cost:      total_estimated_cost,
          reason,
        });
      }
      existing.contract_value       = contract_value;
      existing.total_estimated_cost = total_estimated_cost;
      existing.updated_by           = user_id;
      await existing.save();
      return existing;
    }

    return ContractPOCModel.create({
      tender_id,
      tender_name:          tender.tender_name || "",
      contract_value,
      total_estimated_cost,
      created_by:           user_id,
    });
  }

  static async list({ status, page = 1, limit = 20 } = {}) {
    const q = { is_deleted: { $ne: true } };
    if (status) q.status = status;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const [rows, total] = await Promise.all([
      ContractPOCModel.find(q).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      ContractPOCModel.countDocuments(q),
    ]);
    return { total, page, limit, rows };
  }

  static async getByTender(tender_id) {
    const rec = await ContractPOCModel.findOne({ tender_id }).lean();
    if (!rec) throw new Error(`POC record not found for tender ${tender_id}`);
    return rec;
  }

  // ── POC calculation for a tender at a given date ───────────────────────────
  //
  // Costs incurred = Σ (Expense Dr − Cr) where subtype in Direct/Site for tender_id
  // (either JE header tender_id OR line tender_id).
  static async compute({ tender_id, as_of }) {
    const rec = await ContractPOCModel.findOne({ tender_id }).lean();
    if (!rec) throw new Error(`POC record not found for tender ${tender_id}`);

    const asOf = as_of ? new Date(as_of) : new Date();
    asOf.setHours(23, 59, 59, 999);

    // 1. Get expense account codes (Direct Cost + Site Overhead)
    const expAccounts = await AccountTreeModel.find({
      is_deleted: false,
      is_posting_account: true,
      account_type: "Expense",
      account_subtype: { $in: ["Direct Cost", "Site Overhead"] },
    })
      .select("account_code")
      .lean();
    const expCodes = expAccounts.map((a) => a.account_code);

    // 2. Sum tender-tagged expense movement
    const agg = await JournalEntryModel.aggregate([
      { $match: { status: "approved", je_date: { $lte: asOf } } },
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
      { $match: { effective_tender: tender_id, account_code: { $in: expCodes } } },
      { $group: { _id: null, dr: { $sum: "$debit" }, cr: { $sum: "$credit" } } },
    ]);
    const costsIncurred = r2(agg?.[0] ? agg[0].dr - agg[0].cr : 0);

    // 3. Billed to date (ClientBilling + approved)
    const billAgg = await ClientBillingModel.aggregate([
      { $match: { tender_id, bill_date: { $lte: asOf }, status: { $in: ["Approved", "Pending"] } } },
      { $group: { _id: null, total: { $sum: "$net_amount" } } },
    ]);
    const billedToDate = r2(billAgg?.[0]?.total || 0);

    // 4. POC % (cap at 100)
    const eac         = rec.total_estimated_cost;
    const pocPctRaw   = eac > 0 ? (costsIncurred / eac) * 100 : 0;
    const pocPct      = r2(Math.min(100, Math.max(0, pocPctRaw)));
    const revenueRec  = r2((pocPct / 100) * rec.contract_value);
    const wipAdj      = r2(revenueRec - billedToDate); // + = contract asset, − = contract liability

    return {
      tender_id,
      tender_name:          rec.tender_name,
      as_of:                asOf,
      contract_value:       rec.contract_value,
      total_estimated_cost: eac,
      costs_incurred_to_date: costsIncurred,
      estimated_cost_to_complete: r2(Math.max(0, eac - costsIncurred)),
      poc_pct:              pocPct,
      poc_pct_raw:          r2(pocPctRaw),                 // unclamped, for variance signals
      revenue_recognized:   revenueRec,
      billed_to_date:       billedToDate,
      wip_adjustment:       wipAdj,
      classification:       wipAdj > 0 ? "Contract Asset (under-billed)"
                           : wipAdj < 0 ? "Contract Liability (over-billed / unearned)"
                           : "Balanced",
      over_cost_flag:       costsIncurred > eac,           // incurred > EAC → bad estimate
    };
  }

  static async computeAll({ as_of } = {}) {
    const all = await ContractPOCModel.find({ status: "active" }).select("tender_id").lean();
    const results = [];
    for (const r of all) {
      try { results.push(await this.compute({ tender_id: r.tender_id, as_of })); }
      catch (_) { /* skip */ }
    }
    const totals = results.reduce(
      (a, r) => ({
        contract_value:       r2(a.contract_value + r.contract_value),
        costs_incurred:       r2(a.costs_incurred + r.costs_incurred_to_date),
        revenue_recognized:   r2(a.revenue_recognized + r.revenue_recognized),
        billed_to_date:       r2(a.billed_to_date + r.billed_to_date),
        wip_adjustment:       r2(a.wip_adjustment + r.wip_adjustment),
      }),
      { contract_value: 0, costs_incurred: 0, revenue_recognized: 0, billed_to_date: 0, wip_adjustment: 0 },
    );
    return { as_of: as_of || new Date(), rows: results, totals };
  }

  // ── Persist last_recognized summary + post cumulative WIP JE ───────────────
  //
  // Ind AS 115: every snapshot represents the current *cumulative* POC state,
  // so we reverse the prior snapshot's JE (if any) and post a fresh one that
  // records the current wip_adjustment in the books. If the three account
  // codes are not supplied, the snapshot is saved without a JE (back-compat).
  //
  //   wip_adj > 0  (under-billed — earned more than invoiced):
  //       Dr Contract Asset (Unbilled Revenue)   wip_adj
  //       Cr Revenue                             wip_adj
  //   wip_adj < 0  (over-billed — invoiced more than earned):
  //       Dr Revenue                             |wip_adj|
  //       Cr Contract Liability (Deferred Rev.)  |wip_adj|
  static async snapshot({
    tender_id, as_of, user_id = "",
    contract_asset_code     = "",
    contract_liability_code = "",
    revenue_code            = "",
  }) {
    const calc = await this.compute({ tender_id, as_of });
    const rec  = await ContractPOCModel.findOne({ tender_id });
    if (!rec) throw new Error(`POC record not found for tender ${tender_id}`);

    let newJe = null;
    const wantsJe = contract_asset_code || contract_liability_code || revenue_code;

    if (wantsJe) {
      if (!revenue_code)            throw new Error("revenue_code is required when posting a WIP JE");
      if (!contract_asset_code)     throw new Error("contract_asset_code is required when posting a WIP JE");
      if (!contract_liability_code) throw new Error("contract_liability_code is required when posting a WIP JE");

      // Validate account types (fail fast before touching the JE pipeline)
      const accs = await AccountTreeModel.find({
        account_code: { $in: [contract_asset_code, contract_liability_code, revenue_code] },
        is_deleted: false, is_group: false, is_posting_account: true,
      }).select("account_code account_type").lean();
      const typeOf = Object.fromEntries(accs.map((a) => [a.account_code, a.account_type]));
      if (typeOf[contract_asset_code]     !== "Asset")     throw new Error(`contract_asset_code '${contract_asset_code}' must be an Asset leaf account`);
      if (typeOf[contract_liability_code] !== "Liability") throw new Error(`contract_liability_code '${contract_liability_code}' must be a Liability leaf account`);
      if (typeOf[revenue_code]            !== "Income")    throw new Error(`revenue_code '${revenue_code}' must be an Income leaf account`);

      // 1) Reverse the prior cumulative WIP JE (if one exists)
      if (rec.last_recognized?.je_ref) {
        try {
          const reversal = await JournalEntryService.reverse(String(rec.last_recognized.je_ref), {
            narration: `Reverse prior POC WIP — ${tender_id} (superseded by snapshot on ${calc.as_of.toISOString().slice(0, 10)})`,
            created_by: user_id || null,
          });
          // Mark the prior entry in history as reversed
          const prior = rec.je_history.find((h) => String(h.je_ref) === String(rec.last_recognized.je_ref));
          if (prior) prior.reversal_je_no = reversal.je_no;
        } catch (e) {
          // If the prior JE can't be reversed (already reversed in the ledger?), log and continue.
          // We'd rather have one duplicate accrual than refuse to snapshot.
        }
      }

      // 2) Build + post new cumulative JE (only if wip_adj is material)
      const amt = Math.abs(calc.wip_adjustment);
      if (amt >= 0.01) {
        const lines = calc.wip_adjustment > 0
          ? [
              { account_code: contract_asset_code, dr_cr: "Dr", debit_amt: amt, credit_amt: 0, narration: `POC WIP accrual — ${tender_id}`, tender_id },
              { account_code: revenue_code,        dr_cr: "Cr", debit_amt: 0,   credit_amt: amt, narration: `POC revenue recognised — ${tender_id}`, tender_id },
            ]
          : [
              { account_code: revenue_code,            dr_cr: "Dr", debit_amt: amt, credit_amt: 0, narration: `POC deferred revenue — ${tender_id}`, tender_id },
              { account_code: contract_liability_code, dr_cr: "Cr", debit_amt: 0,   credit_amt: amt, narration: `POC WIP over-billing — ${tender_id}`, tender_id },
            ];

        newJe = await JournalEntryService.create({
          je_date:   calc.as_of,
          je_type:   "Adjustment",
          narration: `POC WIP snapshot — ${tender_id} (${calc.poc_pct}%)`,
          tender_id,
          lines,
          status: "approved",
          created_by: user_id || null,
        });

        rec.je_history.push({
          snapshot_on:        calc.as_of,
          je_ref:             newJe._id,
          je_no:              newJe.je_no,
          revenue_recognized: calc.revenue_recognized,
          wip_adjustment:     calc.wip_adjustment,
          reversal_je_no:     "",
        });
      }
    }

    rec.updated_by      = user_id;
    rec.last_recognized = {
      recognized_on:      calc.as_of,
      poc_pct:            calc.poc_pct,
      revenue_recognized: calc.revenue_recognized,
      cumulative_billed:  calc.billed_to_date,
      wip_adjustment:     calc.wip_adjustment,
      je_ref:             newJe ? newJe._id : null,
      je_no:              newJe ? newJe.je_no : "",
    };
    await rec.save();

    return { ...calc, posted_je: newJe ? { _id: newJe._id, je_no: newJe.je_no } : null };
  }
}

export default ContractPOCService;
