import AssetIssuanceService from "./assetissuance.service.js";

export const createIssuance = async (req, res) => {
  try {
    const result = await AssetIssuanceService.createIssuance(req.body, req.user?._id);
    res.status(201).json({ status: true, message: "Issuance created", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getAllIssuances = async (req, res) => {
  try {
    const result = await AssetIssuanceService.getAll(req.query);
    res.status(200).json({ status: true, data: result.data, meta: result.meta });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getIssuanceById = async (req, res) => {
  try {
    const result = await AssetIssuanceService.getById(req.params.issueId);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const recordReturn = async (req, res) => {
  try {
    const result = await AssetIssuanceService.recordReturn(req.params.issueId, req.body, req.user?._id);
    res.status(200).json({ status: true, message: "Return recorded", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const markIssuanceLost = async (req, res) => {
  try {
    const result = await AssetIssuanceService.markLost(req.params.issueId, req.body.notes, req.user?._id);
    res.status(200).json({ status: true, message: "Marked LOST", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getOverdueIssuances = async (_req, res) => {
  try {
    const result = await AssetIssuanceService.getOverdue();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const sweepOverdue = async (_req, res) => {
  try {
    const result = await AssetIssuanceService.markOverdue();
    res.status(200).json({ status: true, message: "Overdue sweep complete", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
