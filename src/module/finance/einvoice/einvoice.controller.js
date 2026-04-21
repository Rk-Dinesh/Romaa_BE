import EInvoiceService from "./einvoice.service.js";

// Supplier profile is drawn from env or request body. In production you'd
// fetch it from a company-profile collection. For now, the caller can pass
// supplier in body, or we fall back to env vars.
function resolveSupplier(body) {
  return {
    gstin:       body?.supplier?.gstin        || process.env.COMPANY_GSTIN || "",
    legal_name:  body?.supplier?.legal_name   || process.env.COMPANY_LEGAL_NAME || "",
    state_code:  body?.supplier?.state_code   || "",
    state:       body?.supplier?.state        || process.env.COMPANY_STATE || "",
    address1:    body?.supplier?.address1     || process.env.COMPANY_ADDRESS1 || "",
    location:    body?.supplier?.location     || process.env.COMPANY_LOCATION || "",
    pin:         body?.supplier?.pin          || process.env.COMPANY_PIN || "",
  };
}

export const generate = async (req, res) => {
  try {
    const { source_type, source_ref, source_no } = req.body || {};
    const data = await EInvoiceService.generate({
      source_type, source_ref, source_no,
      supplier: resolveSupplier(req.body),
      generated_by: req.user?._id?.toString() || "",
    });
    res.status(201).json({
      status: true,
      message: data.already_generated ? "E-Invoice already exists" : "E-Invoice generated",
      data,
    });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const cancel = async (req, res) => {
  try {
    const data = await EInvoiceService.cancel({
      id:           req.params.id,
      reason:       req.body?.reason || "",
      cancelled_by: req.user?._id?.toString() || "",
    });
    res.status(200).json({ status: true, message: "Cancelled", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const list = async (req, res) => {
  try {
    const data = await EInvoiceService.list(req.query);
    res.status(200).json({ status: true, ...data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getById = async (req, res) => {
  try {
    const data = await EInvoiceService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const getByIrn = async (req, res) => {
  try {
    const data = await EInvoiceService.getByIrn(req.params.irn);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const getQr = async (req, res) => {
  try {
    const data = await EInvoiceService.getQr(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};
