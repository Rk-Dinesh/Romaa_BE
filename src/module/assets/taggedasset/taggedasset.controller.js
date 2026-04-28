import TaggedAssetService from "./taggedasset.service.js";

export const createTaggedAsset = async (req, res) => {
  try {
    const result = await TaggedAssetService.createAsset(req.body, req.user?._id);
    res.status(201).json({ status: true, message: "Tagged asset created", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getAllTaggedAssets = async (req, res) => {
  try {
    const result = await TaggedAssetService.getAll(req.query);
    res.status(200).json({ status: true, data: result.data, meta: result.meta });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getTaggedAssetById = async (req, res) => {
  try {
    const result = await TaggedAssetService.getByAssetId(req.params.assetId);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const updateTaggedAsset = async (req, res) => {
  try {
    const result = await TaggedAssetService.update(req.params.assetId, req.body, req.user?._id);
    res.status(200).json({ status: true, message: "Tagged asset updated", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const updateTaggedAssetStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ status: false, message: "status is required" });
    const result = await TaggedAssetService.updateStatus(req.params.assetId, status, notes, req.user?._id);
    res.status(200).json({ status: true, message: "Status updated", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const transferTaggedAsset = async (req, res) => {
  try {
    const result = await TaggedAssetService.transfer(req.params.assetId, req.body, req.user?._id);
    res.status(200).json({ status: true, message: "Asset transferred", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const deleteTaggedAsset = async (req, res) => {
  try {
    const result = await TaggedAssetService.softDelete(req.params.assetId, req.user?._id);
    res.status(200).json({ status: true, message: "Asset retired (soft-deleted)", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getCalibrationDueAssets = async (req, res) => {
  try {
    const days = req.query.days || 30;
    const result = await TaggedAssetService.getCalibrationDue(days);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getTaggedAssetSummary = async (_req, res) => {
  try {
    const result = await TaggedAssetService.getSummary();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
