import FixedAssetService from "./fixedasset.service.js";

export const create = async (req, res) => {
  try {
    const data = await FixedAssetService.create({ ...req.body, created_by: req.user?._id?.toString() || "" });
    res.status(201).json({ status: true, message: "Fixed asset created", data });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getList = async (req, res) => {
  try {
    const { page, limit, status, category, tender_id, q } = req.query;
    const data = await FixedAssetService.getList({ page, limit, status, category, tender_id, q });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const data = await FixedAssetService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const data = await FixedAssetService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Updated", data });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const archive = async (req, res) => {
  try {
    const data = await FixedAssetService.archive(req.params.id);
    res.status(200).json({ status: true, message: "Archived", data });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const postDepreciation = async (req, res) => {
  try {
    const data = await FixedAssetService.postMonthlyDepreciation({ period_date: req.body?.period_date || req.query?.period_date });
    res.status(200).json({ status: true, message: "Depreciation run completed", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const postDepreciationOne = async (req, res) => {
  try {
    const asset = await FixedAssetService.getById(req.params.id);
    const result = await FixedAssetService.postDepreciationForAsset(asset, req.body?.period_date || new Date());
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const dispose = async (req, res) => {
  try {
    const data = await FixedAssetService.dispose({ id: req.params.id, ...req.body });
    res.status(200).json({ status: true, message: "Asset disposed", data });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getRegister = async (req, res) => {
  try {
    const { as_of_date, category, status } = req.query;
    const data = await FixedAssetService.getRegister({ as_of_date, category, status });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getSchedule = async (req, res) => {
  try {
    const data = await FixedAssetService.getSchedule(req.params.id, { max_months: Number(req.query.max_months) || 120 });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};
