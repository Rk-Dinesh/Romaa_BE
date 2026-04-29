import AssetKpiSnapshotModel from "./assetkpisnapshot.model.js";
import MachineryAsset from "../machinery/machineryasset.model.js";
import MachineDailyLog from "../machinerylogs/machinerylogs.model.js";
import WorkOrderModel from "../workorder/workorder.model.js";
import logger from "../../../config/logger.js";

const DEFAULT_SHIFT_HOURS = Number(process.env.ASSET_KPI_SHIFT_HOURS || 12);

function periodBounds(period_kind, refDate) {
  const d = new Date(refDate);
  if (period_kind === "DAY") {
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const label = start.toISOString().slice(0, 10);
    return { start, end, label };
  }
  if (period_kind === "WEEK") {
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    const day = start.getDay() || 7; // Mon=1..Sun=7 (ISO)
    start.setDate(start.getDate() - (day - 1));
    const end = new Date(start); end.setDate(end.getDate() + 7);
    // ISO week label: YYYY-Www
    const onejan = new Date(start.getFullYear(), 0, 1);
    const week = Math.ceil(((start - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    return { start, end, label: `${start.getFullYear()}-W${String(week).padStart(2, "0")}` };
  }
  // MONTH
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return { start, end, label };
}

class AssetKpiService {
  // Compute and upsert a single period for one asset.
  static async computeForAsset({ asset, period_kind = "DAY", refDate = new Date(), shift_hours = DEFAULT_SHIFT_HOURS }) {
    const { start, end, label } = periodBounds(period_kind, refDate);

    // 1. Daily logs in window
    const logs = await MachineDailyLog.find({
      assetId: asset._id,
      logDate: { $gte: start, $lt: end },
    }).lean();

    const operating_hours = logs.reduce((s, l) => s + (l.netUsage || 0), 0);
    const fuel_consumed   = logs.reduce((s, l) => s + (l.fuelConsumed || 0), 0);
    const productivity_qty = logs.reduce((s, l) => s + (l.quantity || 0), 0);

    // 2. Failures + downtime: corrective WOs CLOSED in window
    const failureWOs = await WorkOrderModel.find({
      asset_ref: asset._id,
      kind: "CORRECTIVE",
      status: { $in: ["COMPLETED", "CLOSED"] },
      $or: [
        { completed_at: { $gte: start, $lt: end } },
        { closed_at:    { $gte: start, $lt: end } },
      ],
    }).lean();
    const failures = failureWOs.length;
    const downtime_hours = failureWOs.reduce((s, w) => s + (w.downtime_hours || 0), 0);

    // 3. Period-aware scheduled hours
    const days = Math.max(1, Math.round((end - start) / 86400000));
    const scheduled_hours = days * shift_hours;
    const available_hours = Math.max(0, scheduled_hours - downtime_hours);

    const mtbf_hours = failures > 0 ? Number((operating_hours / failures).toFixed(2)) : null;
    const mttr_hours = failures > 0 ? Number((downtime_hours / failures).toFixed(2)) : null;

    const availability_pct = scheduled_hours ? Number(((available_hours / scheduled_hours) * 100).toFixed(2)) : 0;
    const utilization_pct  = available_hours ? Number(((operating_hours / available_hours) * 100).toFixed(2)) : 0;
    // Performance: use productivity_qty / (operating_hours * expected_rate). With no
    // expected rate we assume utilization as a proxy so OEE is still meaningful.
    const performance_pct = utilization_pct;
    const quality_pct     = 100;
    const oee_pct = Number(
      ((availability_pct / 100) * (performance_pct / 100) * (quality_pct / 100) * 100).toFixed(2)
    );

    const doc = await AssetKpiSnapshotModel.findOneAndUpdate(
      { asset_ref: asset._id, period_kind, period_label: label },
      {
        asset_ref: asset._id,
        assetId: asset.assetId,
        asset_name: asset.assetName,
        projectId: asset.projectId,
        period_kind,
        period_label: label,
        period_start: start,
        period_end: end,
        operating_hours,
        scheduled_hours,
        downtime_hours,
        available_hours,
        failures,
        mtbf_hours,
        mttr_hours,
        fuel_consumed,
        productivity_qty,
        availability_pct,
        utilization_pct,
        performance_pct,
        quality_pct,
        oee_pct,
        computed_at: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return doc;
  }

  static async computeAll({ period_kind = "DAY", refDate = new Date() } = {}) {
    const assets = await MachineryAsset.find({
      isDeleted: { $ne: true },
      currentStatus: { $ne: "Scrapped" },
    }).lean();
    const stats = { total: assets.length, computed: 0, failed: 0 };
    for (const a of assets) {
      try {
        await AssetKpiService.computeForAsset({ asset: a, period_kind, refDate });
        stats.computed += 1;
      } catch (err) {
        stats.failed += 1;
        logger.error(`[assetKpi] asset=${a.assetId} ${period_kind} compute failed: ${err.message}`);
      }
    }
    return stats;
  }

  static async getForAsset({ assetId, period_kind = "MONTH", limit = 12 }) {
    return AssetKpiSnapshotModel.find({ assetId, period_kind })
      .sort({ period_start: -1 })
      .limit(Number(limit))
      .lean();
  }

  // Project-level rollup: aggregate snapshots in a period bucket
  static async getProjectRollup({ projectId, period_kind = "MONTH", period_label }) {
    const filter = { period_kind };
    if (projectId) filter.projectId = projectId;
    if (period_label) filter.period_label = period_label;
    return AssetKpiSnapshotModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$projectId",
          assets: { $sum: 1 },
          operating_hours: { $sum: "$operating_hours" },
          downtime_hours:  { $sum: "$downtime_hours" },
          failures:        { $sum: "$failures" },
          fuel_consumed:   { $sum: "$fuel_consumed" },
          avg_availability: { $avg: "$availability_pct" },
          avg_utilization:  { $avg: "$utilization_pct" },
          avg_oee:          { $avg: "$oee_pct" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  // Fleet-wide reliability for the assets dashboard
  static async getFleetRollup({ period_kind = "MONTH", period_label }) {
    const filter = { period_kind };
    if (period_label) filter.period_label = period_label;
    const result = await AssetKpiSnapshotModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          assets:           { $sum: 1 },
          operating_hours:  { $sum: "$operating_hours" },
          downtime_hours:   { $sum: "$downtime_hours" },
          failures:         { $sum: "$failures" },
          avg_availability: { $avg: "$availability_pct" },
          avg_utilization:  { $avg: "$utilization_pct" },
          avg_mtbf:         { $avg: "$mtbf_hours" },
          avg_mttr:         { $avg: "$mttr_hours" },
          avg_oee:          { $avg: "$oee_pct" },
        },
      },
    ]);
    return result[0] || null;
  }
}

export default AssetKpiService;
