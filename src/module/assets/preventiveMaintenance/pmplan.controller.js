import PmPlanService from "./pmplan.service.js";

const handle = (fn) => async (req, res) => {
  try {
    const result = await fn(req);
    res.status(result.status || 200).json({ status: true, ...result.body });
  } catch (err) {
    res.status(err.statusCode || 400).json({ status: false, message: err.message });
  }
};

export const createPlan = handle(async (req) => ({
  status: 201,
  body: { message: "PM plan created", data: await PmPlanService.createPlan(req.body, req.user?._id) },
}));
export const getAllPlans = handle(async (req) => {
  const r = await PmPlanService.getAll(req.query);
  return { body: { data: r.data, meta: r.meta } };
});
export const getPlanById = handle(async (req) => ({
  body: { data: await PmPlanService.getById(req.params.planId) },
}));
export const updatePlan = handle(async (req) => ({
  body: { message: "PM plan updated", data: await PmPlanService.update(req.params.planId, req.body, req.user?._id) },
}));
export const togglePlan = handle(async (req) => ({
  body: { message: "Toggled", data: await PmPlanService.toggleActive(req.params.planId, req.user?._id) },
}));
export const getDuePlans = handle(async (req) => ({
  body: { data: await PmPlanService.getDuePlans({ leadDaysOverride: req.query.lead_days ? Number(req.query.lead_days) : undefined }) },
}));
