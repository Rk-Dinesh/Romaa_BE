import AssetKpiService from "./kpi.service.js";
import MachineryAsset from "../machinery/machineryasset.model.js";

const handle = (fn) => async (req, res) => {
  try {
    const r = await fn(req);
    res.status(r.status || 200).json({ status: true, ...r.body });
  } catch (err) {
    res.status(err.statusCode || 400).json({ status: false, message: err.message });
  }
};

export const computeAssetKpi = handle(async (req) => {
  const asset = await MachineryAsset.findOne({ assetId: req.params.assetId });
  if (!asset) return { status: 404, body: { message: "Asset not found" } };
  const data = await AssetKpiService.computeForAsset({
    asset,
    period_kind: req.body.period_kind || "DAY",
    refDate: req.body.refDate ? new Date(req.body.refDate) : new Date(),
  });
  return { body: { message: "Computed", data } };
});

export const computeAll = handle(async (req) => ({
  body: {
    message: "Computed for all assets",
    data: await AssetKpiService.computeAll({
      period_kind: req.body.period_kind || "DAY",
      refDate: req.body.refDate ? new Date(req.body.refDate) : new Date(),
    }),
  },
}));

export const getAssetKpi = handle(async (req) => ({
  body: {
    data: await AssetKpiService.getForAsset({
      assetId: req.params.assetId,
      period_kind: req.query.period_kind || "MONTH",
      limit: req.query.limit || 12,
    }),
  },
}));

export const getProjectRollup = handle(async (req) => ({
  body: {
    data: await AssetKpiService.getProjectRollup({
      projectId: req.query.projectId,
      period_kind: req.query.period_kind || "MONTH",
      period_label: req.query.period_label,
    }),
  },
}));

export const getFleetRollup = handle(async (req) => ({
  body: {
    data: await AssetKpiService.getFleetRollup({
      period_kind: req.query.period_kind || "MONTH",
      period_label: req.query.period_label,
    }),
  },
}));
