import InspectionService from "./inspection.service.js";

const handle = (fn) => async (req, res) => {
  try {
    const r = await fn(req);
    res.status(r.status || 200).json({ status: true, ...r.body });
  } catch (err) {
    res.status(err.statusCode || 400).json({ status: false, message: err.message });
  }
};

export const createTemplate = handle(async (req) => ({
  status: 201,
  body: { message: "Template created", data: await InspectionService.createTemplate(req.body, req.user?._id) },
}));
export const listTemplates = handle(async (req) => ({
  body: { data: await InspectionService.listTemplates(req.query) },
}));
export const getTemplate = handle(async (req) => ({
  body: { data: await InspectionService.getTemplate(req.params.templateId) },
}));
export const updateTemplate = handle(async (req) => ({
  body: { message: "Template updated", data: await InspectionService.updateTemplate(req.params.templateId, req.body, req.user?._id) },
}));

export const submitInspection = handle(async (req) => ({
  status: 201,
  body: { message: "Inspection submitted", data: await InspectionService.submit(req.body, req.user?._id) },
}));
export const listSubmissions = handle(async (req) => {
  const r = await InspectionService.listSubmissions(req.query);
  return { body: { data: r.data, meta: r.meta } };
});
export const getSubmission = handle(async (req) => ({
  body: { data: await InspectionService.getSubmission(req.params.inspectionId) },
}));
