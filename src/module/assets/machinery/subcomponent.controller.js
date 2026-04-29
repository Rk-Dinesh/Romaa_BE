import MachineryAssetService from "./machineryasset.service.js";

const handle = (fn) => async (req, res) => {
  try {
    const r = await fn(req);
    res.status(r.status || 200).json({ status: true, ...r.body });
  } catch (err) {
    res.status(err.statusCode || 400).json({ status: false, message: err.message });
  }
};

export const addSubComponent = handle(async (req) => ({
  status: 201,
  body: {
    message: "Sub-component added",
    data: await MachineryAssetService.addSubComponent(req.params.assetId, req.body),
  },
}));

export const replaceSubComponent = handle(async (req) => ({
  body: {
    message: "Sub-component replaced",
    data: await MachineryAssetService.replaceSubComponent(req.params.assetId, req.params.subId, req.body),
  },
}));

export const listSubComponents = handle(async (req) => ({
  body: {
    data: await MachineryAssetService.listSubComponents(req.params.assetId, {
      activeOnly: req.query.active_only === "true",
    }),
  },
}));
