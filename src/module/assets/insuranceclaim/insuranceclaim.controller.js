import InsuranceClaimService from "./insuranceclaim.service.js";

const handle = (fn) => async (req, res) => {
  try {
    const r = await fn(req);
    res.status(r.status || 200).json({ status: true, ...r.body });
  } catch (err) {
    res.status(err.statusCode || 400).json({ status: false, message: err.message });
  }
};

export const createClaim = handle(async (req) => ({
  status: 201,
  body: { message: "Claim filed", data: await InsuranceClaimService.create(req.body, req.user?._id) },
}));
export const listClaims = handle(async (req) => {
  const r = await InsuranceClaimService.getAll(req.query);
  return { body: { data: r.data, meta: r.meta } };
});
export const getClaim = handle(async (req) => ({
  body: { data: await InsuranceClaimService.getById(req.params.claimId) },
}));
export const updateClaim = handle(async (req) => ({
  body: { message: "Claim updated", data: await InsuranceClaimService.update(req.params.claimId, req.body, req.user?._id) },
}));
export const transitionClaim = handle(async (req) => ({
  body: {
    message: `Transitioned to ${req.body.toStatus}`,
    data: await InsuranceClaimService.transition(req.params.claimId, req.body.toStatus, req.body, req.user?._id),
  },
}));
export const addClaimDocument = handle(async (req) => ({
  body: {
    message: "Document attached",
    data: await InsuranceClaimService.addDocument(req.params.claimId, req.body, req.user?._id),
  },
}));
export const getClaimSummary = handle(async (req) => ({
  body: { data: await InsuranceClaimService.getSummary({ assetId: req.query.assetId }) },
}));
