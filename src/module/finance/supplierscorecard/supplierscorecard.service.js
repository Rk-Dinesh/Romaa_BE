import VendorModel from "../../purchase/vendor/vendor.model.js";
import ContractorModel from "../../hr/contractors/contractor.model.js";
import PurchaseBillModel from "../purchasebill/purchasebill.model.js";
import WeeklyBillingModel from "../weeklyBilling/WeeklyBilling.model.js";

// ── Vendor / Contractor Performance Scorecard ───────────────────────────────
//
// Rates each supplier out of 100 across four dimensions:
//   volume_score       — raw spend, log-scaled so the largest supplier ≈ 100
//   ontime_score       — % of bills paid by due_date (vendor) or before next
//                        week's billing (contractor stand-in for on-time cycle)
//   accuracy_score     — 100 − (credit-note+debit-note value / bill value × 100),
//                        floored at 0. CN/DN means the bill needed correcting.
//   settlement_score   — % fully paid (paid_status = "paid")
//
// Final score = weighted average (volume 25%, ontime 30%, accuracy 25%, settlement 20%).

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;
const MS_DAY = 86400000;

function bandFromScore(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

// Compute on-time score for a bill based on due_date and final payment date.
// Fallback: when credit_days = 0 the pre-save hook leaves due_date = null, so
// treat doc_date as the implicit due date (cash-on-delivery terms).
function wasOnTime(bill) {
  if (bill.paid_status !== "paid") return null;   // not yet settled
  const yardstick = bill.due_date ? new Date(bill.due_date)
                  : bill.doc_date ? new Date(bill.doc_date)
                  : null;
  if (!yardstick) return null;
  const refs = (bill.payment_refs || []).filter((r) => r.paid_date);
  if (!refs.length) return null;
  const lastPaid = refs.reduce((m, r) => new Date(r.paid_date) > m ? new Date(r.paid_date) : m, new Date(0));
  return lastPaid <= yardstick;
}

// Compute on-time for contractor weekly bills: approved within 7 days of to_date
function contractorOnTime(bill) {
  if (!bill.approved_at || !bill.to_date) return null;
  const delta = (new Date(bill.approved_at) - new Date(bill.to_date)) / MS_DAY;
  return delta <= 7;
}

function scaleVolume(totals, mine) {
  if (mine <= 0) return 0;
  const max = Math.max(...totals, 1);
  // log-scale so medium-volume suppliers aren't flattened to ~0
  const num = Math.log10(1 + mine);
  const den = Math.log10(1 + max);
  if (den <= 0) return 0;
  return r2((num / den) * 100);
}

class SupplierScorecardService {

  // GET /supplier-scorecard/vendors?from=&to=
  static async vendors({ from_date, to_date } = {}) {
    const q = { status: "approved", is_deleted: { $ne: true } };
    if (from_date || to_date) {
      q.doc_date = {};
      if (from_date) q.doc_date.$gte = new Date(from_date);
      if (to_date) {
        const to = new Date(to_date); to.setHours(23, 59, 59, 999);
        q.doc_date.$lte = to;
      }
    }
    const bills = await PurchaseBillModel.find(q)
      .select("vendor_id vendor_name net_amount due_date paid_status amount_paid cn_amount dn_amount payment_refs doc_date line_items")
      .limit(500)
      .lean();

    // Build market (all-vendor) avg unit price per material_id over the window
    // so each vendor's avg can be benchmarked. Weighted by qty.
    const marketAgg = {};   // item_id -> { qty, value }
    for (const b of bills) {
      for (const li of b.line_items || []) {
        if (!li.item_id) continue;
        const k = String(li.item_id);
        const qty = li.accepted_qty || 0;
        const up  = li.unit_price || 0;
        if (qty <= 0 || up <= 0) continue;
        if (!marketAgg[k]) marketAgg[k] = { qty: 0, value: 0 };
        marketAgg[k].qty   += qty;
        marketAgg[k].value += qty * up;
      }
    }
    const marketAvg = {};
    for (const k of Object.keys(marketAgg)) {
      const { qty, value } = marketAgg[k];
      if (qty > 0) marketAvg[k] = value / qty;
    }

    // Group by vendor_id
    const byVendor = {};
    for (const b of bills) {
      const k = b.vendor_id || "__unknown__";
      if (!byVendor[k]) byVendor[k] = { vendor_id: k, vendor_name: b.vendor_name || "", bills: [] };
      byVendor[k].bills.push(b);
    }

    const volumes = Object.values(byVendor).map((v) => v.bills.reduce((s, b) => s + (b.net_amount || 0), 0));

    const rows = Object.values(byVendor).map((v) => {
      const total_spend = r2(v.bills.reduce((s, b) => s + (b.net_amount || 0), 0));
      const total_cnd   = r2(v.bills.reduce((s, b) => s + (b.cn_amount || 0) + (b.dn_amount || 0), 0));

      const paidBills = v.bills.filter((b) => b.paid_status === "paid");
      const settlement_pct = v.bills.length ? (paidBills.length / v.bills.length) * 100 : 0;

      const ontimeSamples = v.bills.map(wasOnTime).filter((x) => x !== null);
      const ontime_pct = ontimeSamples.length
        ? (ontimeSamples.filter(Boolean).length / ontimeSamples.length) * 100
        : 0;

      const accuracy_pct = total_spend > 0
        ? Math.max(0, 100 - (total_cnd / total_spend) * 100)
        : 100;

      // Price variance vs market: Σ(qty × |vendor_up − market_up|) / Σ(qty × market_up)
      let pvNumer = 0, pvDenom = 0, pvItems = 0, pvOverMarket = 0;
      for (const b of v.bills) {
        for (const li of b.line_items || []) {
          if (!li.item_id || (li.accepted_qty || 0) <= 0 || (li.unit_price || 0) <= 0) continue;
          const mk = marketAvg[String(li.item_id)];
          if (!mk) continue;
          pvNumer += li.accepted_qty * Math.abs(li.unit_price - mk);
          pvDenom += li.accepted_qty * mk;
          pvItems += 1;
          if (li.unit_price > mk) pvOverMarket += 1;
        }
      }
      // 0 = exactly at market, clamp penalty at 100% overpay → 0 score
      const variance_ratio = pvDenom > 0 ? pvNumer / pvDenom : 0;
      const price_variance_score = pvItems === 0 ? 0 : r2(Math.max(0, 100 - Math.min(variance_ratio, 1) * 100));

      const volume_score     = scaleVolume(volumes, total_spend);
      const ontime_score     = r2(ontime_pct);
      const accuracy_score   = r2(accuracy_pct);
      const settlement_score = r2(settlement_pct);

      // Weights: volume 20, ontime 25, accuracy 20, settlement 20, price 15
      const overall = r2(
        volume_score         * 0.20 +
        ontime_score         * 0.25 +
        accuracy_score       * 0.20 +
        settlement_score     * 0.20 +
        price_variance_score * 0.15,
      );

      return {
        vendor_id:     v.vendor_id,
        vendor_name:   v.vendor_name,
        bill_count:    v.bills.length,
        total_spend,
        total_cnd,
        volume_score,
        ontime_score,
        accuracy_score,
        settlement_score,
        price_variance_score,
        price_variance_sample_items: pvItems,
        price_variance_ratio:       r2(variance_ratio),
        items_priced_above_market:  pvOverMarket,
        overall_score: overall,
        grade:         bandFromScore(overall),
      };
    });

    rows.sort((a, b) => b.overall_score - a.overall_score);
    return { from_date: from_date || null, to_date: to_date || null, rows };
  }

  // GET /supplier-scorecard/contractors?from=&to=
  static async contractors({ from_date, to_date } = {}) {
    const q = { status: "Approved", is_deleted: { $ne: true } };
    if (from_date || to_date) {
      q.bill_date = {};
      if (from_date) q.bill_date.$gte = new Date(from_date);
      if (to_date) {
        const to = new Date(to_date); to.setHours(23, 59, 59, 999);
        q.bill_date.$lte = to;
      }
    }
    const bills = await WeeklyBillingModel.find(q)
      .select("contractor_id contractor_name total_amount net_payable paid_status amount_paid cn_amount dn_amount approved_at to_date")
      .limit(500)
      .lean();

    const byC = {};
    for (const b of bills) {
      const k = b.contractor_id || "__unknown__";
      if (!byC[k]) byC[k] = { contractor_id: k, contractor_name: b.contractor_name || "", bills: [] };
      byC[k].bills.push(b);
    }

    const volumes = Object.values(byC).map((v) => v.bills.reduce((s, b) => s + (b.total_amount || 0), 0));

    const rows = Object.values(byC).map((v) => {
      const total_billed = r2(v.bills.reduce((s, b) => s + (b.total_amount || 0), 0));
      const total_cnd    = r2(v.bills.reduce((s, b) => s + (b.cn_amount || 0) + (b.dn_amount || 0), 0));

      const paidBills = v.bills.filter((b) => b.paid_status === "paid");
      const settlement_pct = v.bills.length ? (paidBills.length / v.bills.length) * 100 : 0;

      const samples = v.bills.map(contractorOnTime).filter((x) => x !== null);
      const ontime_pct = samples.length ? (samples.filter(Boolean).length / samples.length) * 100 : 0;

      const accuracy_pct = total_billed > 0
        ? Math.max(0, 100 - (total_cnd / total_billed) * 100)
        : 100;

      const volume_score     = scaleVolume(volumes, total_billed);
      const ontime_score     = r2(ontime_pct);
      const accuracy_score   = r2(accuracy_pct);
      const settlement_score = r2(settlement_pct);
      const overall = r2(
        volume_score     * 0.25 +
        ontime_score     * 0.30 +
        accuracy_score   * 0.25 +
        settlement_score * 0.20,
      );
      return {
        contractor_id:   v.contractor_id,
        contractor_name: v.contractor_name,
        bill_count:      v.bills.length,
        total_billed,
        total_cnd,
        volume_score,
        ontime_score,
        accuracy_score,
        settlement_score,
        overall_score:   overall,
        grade:           bandFromScore(overall),
      };
    });

    rows.sort((a, b) => b.overall_score - a.overall_score);
    return { from_date: from_date || null, to_date: to_date || null, rows };
  }

  // GET /supplier-scorecard/vendor/:vendor_id
  // Drill-down for a single vendor — returns the score + all bills.
  static async vendorDetail({ vendor_id, from_date, to_date }) {
    if (!vendor_id) throw new Error("vendor_id is required");
    const v = await VendorModel.findOne({ vendor_id }).lean();
    if (!v)         throw new Error("Vendor not found");

    const { rows } = await this.vendors({ from_date, to_date });
    const row = rows.find((r) => r.vendor_id === vendor_id);
    const q = { vendor_id, status: "approved", is_deleted: { $ne: true } };
    if (from_date || to_date) {
      q.doc_date = {};
      if (from_date) q.doc_date.$gte = new Date(from_date);
      if (to_date) {
        const to = new Date(to_date); to.setHours(23, 59, 59, 999);
        q.doc_date.$lte = to;
      }
    }
    const bills = await PurchaseBillModel.find(q)
      .select("doc_id doc_date due_date net_amount paid_status amount_paid cn_amount dn_amount")
      .sort({ doc_date: -1 })
      .limit(500)
      .lean();

    return { vendor: v, scorecard: row || null, bills };
  }

  static async contractorDetail({ contractor_id, from_date, to_date }) {
    if (!contractor_id) throw new Error("contractor_id is required");
    const c = await ContractorModel.findOne({ contractor_id }).lean();
    if (!c)             throw new Error("Contractor not found");

    const { rows } = await this.contractors({ from_date, to_date });
    const row = rows.find((r) => r.contractor_id === contractor_id);
    const q = { contractor_id, status: "Approved", is_deleted: { $ne: true } };
    if (from_date || to_date) {
      q.bill_date = {};
      if (from_date) q.bill_date.$gte = new Date(from_date);
      if (to_date) {
        const to = new Date(to_date); to.setHours(23, 59, 59, 999);
        q.bill_date.$lte = to;
      }
    }
    const bills = await WeeklyBillingModel.find(q)
      .select("bill_no bill_date from_date to_date total_amount net_payable paid_status approved_at cn_amount dn_amount")
      .sort({ bill_date: -1 })
      .limit(500)
      .lean();

    return { contractor: c, scorecard: row || null, bills };
  }
}

export default SupplierScorecardService;
