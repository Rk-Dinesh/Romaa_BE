import MachineryAssetService from "./machineryasset.service.js";

export const createMachineryAsset = async (req, res) => {
  try {
    const result = await MachineryAssetService.addMachineryAsset(req.body);
    res.status(201).json({ status: true, message: "Machinery Asset created", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get Asset by assetId (e.g., /api/assets/EX-01)
export const getMachineryAsset = async (req, res) => {
  try {
    const { assetId } = req.params; // Expecting string like "EX-01"
    const result = await MachineryAssetService.getAssetByAssetId(assetId);
    
    if (!result) return res.status(404).json({ status: false, message: "Asset not found" });
    
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update Asset
export const updateMachineryAsset = async (req, res) => {
  try {
    const { assetId } = req.params;
    const result = await MachineryAssetService.updateAssetDetails(assetId, req.body);
    res.status(200).json({ status: true, message: "Asset updated", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get Full History (Dashboard View)
export const getAssetDashboard = async (req, res) => {
  try {
    const { assetId } = req.params;
    const result = await MachineryAssetService.getAssetHistory(assetId);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const transferMachineryAsset = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { projectId, currentSite } = req.body; // Expect these in body

    if (!projectId || !currentSite) {
        return res.status(400).json({ status: false, message: "projectId and currentSite are required" });
    }

    const result = await MachineryAssetService.transferAsset(assetId, projectId, currentSite);
    res.status(200).json({ status: true, message: "Asset transferred successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAssets = async (req, res) => {
  try {
    const { query } = req.params;
    const result = await MachineryAssetService.getAssets(query);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateAssetStatus = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({ status: false, message: "Status is required" });
    }

    const result = await MachineryAssetService.updateAssetStatus(assetId, status, remarks);
    res.status(200).json({ status: true, message: "Asset status updated", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getExpiryAlerts = async (req, res) => {
  try {
    const result = await MachineryAssetService.getExpiryAlerts();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAssetsByProjectId = async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await MachineryAssetService.getAssetsByProjectId(projectId);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


