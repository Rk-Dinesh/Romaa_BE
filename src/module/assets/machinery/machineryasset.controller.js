import machineryassetService from "./machineryasset.service.js";

// Create machinery asset
export const createMachinery = async (req, res) => {
  try {
    const machinery = await machineryassetService.createMachinery(req.body);
    res.status(201).json({ message: "Machinery created", data: machinery });
  } catch (error) {
    res.status(400).json({ message: "Error creating machinery", error: error.message });
  }
};

// Assign project id and site details
export const assignProjectAndSite = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { projectId, siteDetails } = req.body;
    if (!projectId || !siteDetails) return res.status(400).json({ message: "projectId and siteDetails required" });

    const updated = await machineryassetService.assignProjectAndSite(assetId, projectId, siteDetails);
    if (!updated) return res.status(404).json({ message: "Asset not found" });

    res.status(200).json({ message: "Project and site assigned", data: updated });
  } catch (error) {
    res.status(400).json({ message: "Error assigning project/site", error: error.message });
  }
};

// Get assets by projectId
export const getAssetsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const assets = await machineryassetService.getAssetsByProject(projectId);
    res.status(200).json({ data: assets });
  } catch (error) {
    res.status(400).json({ message: "Error fetching assets", error: error.message });
  }
};

// Enter meter reading
export const enterMeterReading = async (req, res) => {
  try {
    const { assetId } = req.params;
    const meterData = req.body;

    const updated = await machineryassetService.enterMeterReading(assetId, meterData);
    if (!updated) return res.status(404).json({ message: "Asset not found" });

    res.status(200).json({ message: "Meter reading recorded", data: updated });
  } catch (error) {
    res.status(400).json({ message: "Error recording meter reading", error: error.message });
  }
};

// Enter trip details
export const enterTripDetails = async (req, res) => {
  try {
    const { assetId } = req.params;
    const tripData = req.body;

    const updated = await machineryassetService.enterTripDetails(assetId, tripData);
    if (!updated) return res.status(404).json({ message: "Asset not found" });

    res.status(200).json({ message: "Trip details recorded", data: updated });
  } catch (error) {
    res.status(400).json({ message: "Error recording trip details", error: error.message });
  }
};

// Update status
export const updateStatus = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { currentStatus, availabilityStatus } = req.body;
    if (!currentStatus && !availabilityStatus) return res.status(400).json({ message: "Provide currentStatus or availabilityStatus" });

    const updated = await machineryassetService.updateStatus(assetId, { currentStatus, availabilityStatus });
    if (!updated) return res.status(404).json({ message: "Asset not found" });

    res.status(200).json({ message: "Status updated", data: updated });
  } catch (error) {
    res.status(400).json({ message: "Error updating status", error: error.message });
  }
};

// Get meter reading history
export const getMeterReadingHistory = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { fromDate, toDate, limit } = req.query;
    
    const history = await machineryassetService.getMeterReadingHistory(assetId, {
      fromDate,
      toDate,
      limit: parseInt(limit) || 50
    });
    
    res.status(200).json({ 
      message: "Meter reading history fetched", 
      data: history 
    });
  } catch (error) {
    res.status(400).json({ 
      message: "Error fetching meter reading history", 
      error: error.message 
    });
  }
};

// Get trip history
export const getTripHistory = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { fromDate, toDate, limit } = req.query;
    
    const history = await machineryassetService.getTripHistory(assetId, {
      fromDate,
      toDate,
      limit: parseInt(limit) || 50
    });
    
    res.status(200).json({ 
      message: "Trip history fetched", 
      data: history 
    });
  } catch (error) {
    res.status(400).json({ 
      message: "Error fetching trip history", 
      error: error.message 
    });
  }
};

// POST new meter reading
export const addMeterReading = async (req, res) => {
  try {
    const { assetId } = req.params;
    const meterData = req.body;

    const updatedAsset = await machineryassetService.addMeterReading(assetId, meterData);
    if (!updatedAsset) return res.status(404).json({ message: "Asset not found" });

    res.status(201).json({ message: "Meter reading added", data: updatedAsset });
  } catch (error) {
    res.status(400).json({ message: "Error adding meter reading", error: error.message });
  }
};

// POST new trip details
export const addTripDetails = async (req, res) => {
  try {
    const { assetId } = req.params;
    const tripData = req.body;

    const updatedAsset = await machineryassetService.addTripDetails(assetId, tripData);
    if (!updatedAsset) return res.status(404).json({ message: "Asset not found" });

    res.status(201).json({ message: "Trip details added", data: updatedAsset });
  } catch (error) {
    res.status(400).json({ message: "Error adding trip details", error: error.message });
  }
};

