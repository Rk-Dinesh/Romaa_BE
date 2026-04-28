import AssetCategoryService from "./assetcategory.service.js";

export const createAssetCategory = async (req, res) => {
  try {
    const result = await AssetCategoryService.createCategory(req.body);
    res.status(201).json({ status: true, message: "Asset category created", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getAllAssetCategories = async (req, res) => {
  try {
    const result = await AssetCategoryService.getAll(req.query);
    res.status(200).json({ status: true, data: result.data, meta: result.meta });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getGroupedAssetCategories = async (_req, res) => {
  try {
    const result = await AssetCategoryService.getGrouped();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAssetCategoryById = async (req, res) => {
  try {
    const result = await AssetCategoryService.getById(req.params.id);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const getAssetCategoryByCode = async (req, res) => {
  try {
    const result = await AssetCategoryService.getByCode(req.params.code);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const updateAssetCategory = async (req, res) => {
  try {
    const result = await AssetCategoryService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Asset category updated", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const deleteAssetCategory = async (req, res) => {
  try {
    await AssetCategoryService.deleteById(req.params.id);
    res.status(200).json({ status: true, message: "Asset category deleted" });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const toggleAssetCategoryStatus = async (req, res) => {
  try {
    const result = await AssetCategoryService.toggleStatus(req.params.id);
    const text = result.isActive ? "Activated" : "Deactivated";
    res.status(200).json({ status: true, message: `Asset category ${text}`, data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

// Seeds the master collection with the built-in construction asset taxonomy.
// Idempotent — safe to call repeatedly; only inserts what's missing.
export const seedAssetCategoryDefaults = async (_req, res) => {
  try {
    const result = await AssetCategoryService.seedDefaults();
    res.status(200).json({ status: true, message: "Seed complete", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
