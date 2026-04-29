import RentalService from "./rental.service.js";

const handle = (fn) => async (req, res) => {
  try {
    const r = await fn(req);
    res.status(r.status || 200).json({ status: true, ...r.body });
  } catch (err) {
    res.status(err.statusCode || 400).json({ status: false, message: err.message });
  }
};

export const createAgreement = handle(async (req) => ({
  status: 201,
  body: { message: "Agreement created", data: await RentalService.createAgreement(req.body, req.user?._id) },
}));
export const listAgreements = handle(async (req) => {
  const r = await RentalService.listAgreements(req.query);
  return { body: { data: r.data, meta: r.meta } };
});
export const getAgreement = handle(async (req) => ({
  body: { data: await RentalService.getAgreement(req.params.agreementId) },
}));
export const updateAgreement = handle(async (req) => ({
  body: { message: "Agreement updated", data: await RentalService.updateAgreement(req.params.agreementId, req.body, req.user?._id) },
}));

export const generateInvoice = handle(async (req) => ({
  status: 201,
  body: {
    message: "Invoice generated",
    data: await RentalService.generateInvoice(
      { agreement_id: req.params.agreementId, period_start: req.body.period_start, period_end: req.body.period_end },
      req.user?._id
    ),
  },
}));
export const listInvoices = handle(async (req) => {
  const r = await RentalService.listInvoices(req.query);
  return { body: { data: r.data, meta: r.meta } };
});
export const finalizeInvoice = handle(async (req) => ({
  body: {
    message: "Invoice finalized",
    data: await RentalService.finalizeInvoice(req.params.invoiceId, req.user?._id),
  },
}));
export const getAssetPnl = handle(async (req) => ({
  body: {
    data: await RentalService.getAssetPnl({
      asset_id_label: req.params.assetId,
      from: req.query.from,
      to: req.query.to,
    }),
  },
}));
