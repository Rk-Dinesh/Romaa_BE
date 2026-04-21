import EwayBillService from "./ewaybill.service.js";

function resolveSupplier(body) {
  return {
    gstin:       body?.supplier?.gstin      || process.env.COMPANY_GSTIN || "",
    legal_name:  body?.supplier?.legal_name || process.env.COMPANY_LEGAL_NAME || "",
    state_code:  body?.supplier?.state_code || process.env.COMPANY_STATE_CODE || "",
  };
}

export const generate = async (req, res) => {
  try {
    const data = await EwayBillService.generate({
      ...req.body,
      supplier: resolveSupplier(req.body),
      generated_by: req.user?._id?.toString() || "",
    });
    res.status(201).json({
      status: true,
      message: data.already_generated ? "E-Way Bill already exists" : "E-Way Bill generated",
      data,
    });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const updatePartB = async (req, res) => {
  try {
    const data = await EwayBillService.updatePartB({
      id: req.params.id,
      vehicle_no: req.body?.vehicle_no,
      from_place: req.body?.from_place || "",
      reason:     req.body?.reason || "",
      updated_by: req.user?._id?.toString() || "",
    });
    res.status(200).json({ status: true, message: "Part B updated", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const cancel = async (req, res) => {
  try {
    const data = await EwayBillService.cancel({
      id: req.params.id,
      reason: req.body?.reason || "",
      cancelled_by: req.user?._id?.toString() || "",
    });
    res.status(200).json({ status: true, message: "Cancelled", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const markExpired = async (_req, res) => {
  try {
    const data = await EwayBillService.markExpired();
    res.status(200).json({ status: true, message: "Expired E-Way Bills updated", data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const list = async (req, res) => {
  try {
    const data = await EwayBillService.list(req.query);
    res.status(200).json({ status: true, ...data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getById = async (req, res) => {
  try {
    const data = await EwayBillService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const getByEwbNo = async (req, res) => {
  try {
    const data = await EwayBillService.getByEwbNo(req.params.ewb_no);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};
