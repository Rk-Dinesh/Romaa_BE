import WorkOrderService from "./workorder.service.js";

const handle = (fn) => async (req, res) => {
  try {
    const r = await fn(req);
    res.status(r.status || 200).json({ status: true, ...r.body });
  } catch (err) {
    res.status(err.statusCode || 400).json({ status: false, message: err.message });
  }
};

export const createWorkOrder = handle(async (req) => ({
  status: 201,
  body: { message: "Work order created", data: await WorkOrderService.create(req.body, req.user?._id) },
}));
export const getAllWorkOrders = handle(async (req) => {
  const r = await WorkOrderService.getAll(req.query);
  return { body: { data: r.data, meta: r.meta } };
});
export const getWorkOrderById = handle(async (req) => ({
  body: { data: await WorkOrderService.getById(req.params.workOrderNo) },
}));
export const updateWorkOrder = handle(async (req) => ({
  body: { message: "Work order updated", data: await WorkOrderService.update(req.params.workOrderNo, req.body, req.user?._id) },
}));
export const transitionWorkOrder = handle(async (req) => ({
  body: {
    message: `Transitioned to ${req.body.toStatus}`,
    data: await WorkOrderService.transition(req.params.workOrderNo, req.body.toStatus, { notes: req.body.notes, reading: req.body.reading }, req.user?._id),
  },
}));
export const autoCreatePmWorkOrders = handle(async (req) => ({
  body: {
    message: "Auto-created from due PM plans",
    data: await WorkOrderService.autoCreateFromDuePlans(req.user?._id),
  },
}));
