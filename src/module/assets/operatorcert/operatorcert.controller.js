import OperatorCertService from "./operatorcert.service.js";

const handle = (fn) => async (req, res) => {
  try {
    const r = await fn(req);
    res.status(r.status || 200).json({ status: true, ...r.body });
  } catch (err) {
    res.status(err.statusCode || 400).json({ status: false, message: err.message });
  }
};

export const createCert = handle(async (req) => ({
  status: 201,
  body: { message: "Certification created", data: await OperatorCertService.create(req.body, req.user?._id) },
}));
export const listCerts = handle(async (req) => {
  const r = await OperatorCertService.getAll(req.query);
  return { body: { data: r.data, meta: r.meta } };
});
export const getCert = handle(async (req) => ({
  body: { data: await OperatorCertService.getById(req.params.certId) },
}));
export const updateCert = handle(async (req) => ({
  body: { message: "Certification updated", data: await OperatorCertService.update(req.params.certId, req.body, req.user?._id) },
}));
export const revokeCert = handle(async (req) => ({
  body: {
    message: "Certification revoked",
    data: await OperatorCertService.revoke(req.params.certId, req.body.reason, req.user?._id),
  },
}));
export const verifyAuthorized = handle(async (req) => ({
  body: {
    data: await OperatorCertService.findValid({
      employee_id: req.query.employee_id,
      asset_class: req.query.asset_class,
      asset_category: req.query.asset_category,
    }),
  },
}));
