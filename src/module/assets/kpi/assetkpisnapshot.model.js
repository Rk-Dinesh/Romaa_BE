import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// AssetKpiSnapshot — daily / weekly / monthly rollup of reliability metrics
// per asset. Cached so dashboards don't recompute on every page load. The KPI
// service backfills/refreshes these on demand and via daily cron.
//
// Definitions (industry-standard EAM):
//   • Operating Hours: sum of MachineDailyLog.netUsage in HOURS-tracked assets
//   • Available Hours: scheduled-shift hours minus downtime
//   • Downtime Hours:  sum of WorkOrder.downtime_hours + breakdown gaps
//   • MTBF = Operating Hours / Number of Failures        (between failures)
//   • MTTR = Total Downtime / Number of Failures         (to repair)
//   • Availability% = (Available Hours / Scheduled Hours) * 100
//   • Utilization%  = (Operating Hours / Available Hours) * 100
//   • OEE = Availability × Performance × Quality          (we approximate Quality=1
//           when no defect data; Performance from productivity/expected-rate)

const AssetKpiSnapshotSchema = new mongoose.Schema(
  {
    asset_ref:   { type: Schema.Types.ObjectId, ref: "MachineryAsset", required: true, index: true },
    assetId:     { type: String, required: true, index: true },
    asset_name:  String,
    projectId:   { type: String, index: true },

    period_kind: { type: String, enum: ["DAY", "WEEK", "MONTH"], required: true, index: true },
    period_label: { type: String, required: true, index: true }, // "2026-04-29" | "2026-W18" | "2026-04"
    period_start: { type: Date, required: true, index: true },
    period_end:   { type: Date, required: true },

    operating_hours: { type: Number, default: 0 },
    scheduled_hours: { type: Number, default: 0 }, // shift hours (8/12/24)
    downtime_hours:  { type: Number, default: 0 },
    available_hours: { type: Number, default: 0 },

    failures:     { type: Number, default: 0 }, // # of breakdown WOs in period
    mtbf_hours:   { type: Number, default: null }, // null when failures=0
    mttr_hours:   { type: Number, default: null }, // null when failures=0

    fuel_consumed: { type: Number, default: 0 },
    productivity_qty: { type: Number, default: 0 }, // sum of MachineDailyLog.quantity

    availability_pct: { type: Number, default: 0 },
    utilization_pct:  { type: Number, default: 0 },
    performance_pct:  { type: Number, default: 0 }, // versus expected-rate when set
    quality_pct:      { type: Number, default: 100 }, // default — no defect data
    oee_pct:          { type: Number, default: 0 },

    computed_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AssetKpiSnapshotSchema.index({ asset_ref: 1, period_kind: 1, period_label: 1 }, { unique: true });
AssetKpiSnapshotSchema.index({ projectId: 1, period_kind: 1, period_label: 1 });

AssetKpiSnapshotSchema.plugin(auditPlugin, { entity_type: "AssetKpiSnapshot" });

const AssetKpiSnapshotModel = mongoose.model("AssetKpiSnapshot", AssetKpiSnapshotSchema);
export default AssetKpiSnapshotModel;
