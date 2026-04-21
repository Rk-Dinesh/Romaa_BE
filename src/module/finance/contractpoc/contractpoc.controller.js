import ContractPOCService from "./contractpoc.service.js";

export const upsert = async (req, res) => {
  try {
    const data = await ContractPOCService.upsert({
      ...req.body,
      user_id: req.user?._id?.toString() || "",
    });
    res.status(201).json({ status: true, message: "POC record saved", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const list = async (req, res) => {
  try {
    const data = await ContractPOCService.list(req.query);
    res.status(200).json({ status: true, ...data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getByTender = async (req, res) => {
  try {
    const data = await ContractPOCService.getByTender(req.params.tender_id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const compute = async (req, res) => {
  try {
    const data = await ContractPOCService.compute({
      tender_id: req.params.tender_id,
      as_of:     req.query.as_of,
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const computeAll = async (req, res) => {
  try {
    const data = await ContractPOCService.computeAll({ as_of: req.query.as_of });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const snapshot = async (req, res) => {
  try {
    const data = await ContractPOCService.snapshot({
      tender_id:               req.params.tender_id,
      as_of:                   req.body?.as_of,
      user_id:                 req.user?._id?.toString() || "",
      contract_asset_code:     req.body?.contract_asset_code || "",
      contract_liability_code: req.body?.contract_liability_code || "",
      revenue_code:            req.body?.revenue_code || "",
    });
    res.status(200).json({ status: true, message: "POC snapshot persisted", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
