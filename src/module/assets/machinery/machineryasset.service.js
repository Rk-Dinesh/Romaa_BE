import IdcodeServices from "../../idcode/idcode.service.js";
import MachineryAssetModel from "./machineryasset.model.js";


class MachineryAssetService {
  // Create machinery with generated unique assetId
  static async createMachinery(data) {
    const idname = "MachineryAsset";
    const idcode = "MACH";
    await IdcodeServices.addIdCode(idname, idcode).catch(() => {}); // Ignore 'exists' warning
    const assetId = await IdcodeServices.generateCode(idname);

    const newMachinery = new MachineryAssetModel({
      assetId,
      ...data,
    });
    return await newMachinery.save();
  }

  // Update projectId and site details by assetId
  static async assignProjectAndSite(assetId, projectId, siteDetails) {
    return await MachineryAssetModel.findOneAndUpdate(
      { assetId },
      { projectId, currentSite: siteDetails },
      { new: true }
    );
  }

  // Get basic asset details with site info by projectId
  static async getAssetsByProject(projectId) {
    return await MachineryAssetModel.find({ projectId }).select(
      "assetId assetName assetType currentSite currentStatus availabilityStatus"
    );
  }

  // Update currentStatus or availabilityStatus
  static async updateStatus(assetId, { currentStatus, availabilityStatus }) {
    const update = {};
    if (currentStatus) update.currentStatus = currentStatus;
    if (availabilityStatus) update.availabilityStatus = availabilityStatus;
    return await MachineryAssetModel.findOneAndUpdate({ assetId }, update, {
      new: true,
    });
  }

  // Optional: Get single asset details by assetId
  static async getAssetByAssetId(assetId) {
    return await MachineryAssetModel.findOne({ assetId });
  }

  // Get meter reading history by assetId (with optional date filtering)
static async getMeterReadingHistory(assetId, { fromDate, toDate, limit = 50 } = {}) {
  const query = { assetId };
  const projection = { 
    assetName: 1, 
    assetId: 1, 
    meterReadingHistory: { 
      $slice: ["$meterReadingHistory", -limit] // Last N records
    } 
  };

  if (fromDate || toDate) {
    query["meterReadingHistory.readingDate"] = {};
    if (fromDate) query["meterReadingHistory.readingDate"].$gte = new Date(fromDate);
    if (toDate) query["meterReadingHistory.readingDate"].$lte = new Date(toDate);
  }

  const asset = await MachineryAssetModel.findOne(query).lean();
  if (!asset) throw new Error("Asset not found");

  return {
    assetId: asset.assetId,
    assetName: asset.assetName,
    meterReadingHistory: asset.meterReadingHistory || []
  };
}

// Get trip history by assetId (with optional date filtering)
static async getTripHistory(assetId, { fromDate, toDate, limit = 50 } = {}) {
  const query = { assetId };
  const projection = { 
    assetName: 1, 
    assetId: 1, 
    tripHistory: { 
      $slice: ["$tripHistory", -limit] // Last N records
    } 
  };

  if (fromDate || toDate) {
    query["tripHistory.tripDate"] = {};
    if (fromDate) query["tripHistory.tripDate"].$gte = new Date(fromDate);
    if (toDate) query["tripHistory.tripDate"].$lte = new Date(toDate);
  }

  const asset = await MachineryAssetModel.findOne(query).lean();
  if (!asset) throw new Error("Asset not found");

  return {
    assetId: asset.assetId,
    assetName: asset.assetName,
    tripHistory: asset.tripHistory || []
  };
}

// Add new meter reading entry
static async addMeterReading(assetId, meterData) {
  const update = {
    $push: { meterReadingHistory: meterData },
    $set: {
      meterStartReading: meterData.meterStartReading,
      meterEndReading: meterData.meterEndReading,
      tripCount: meterData.tripCount,
      fuelReading: meterData.fuelReading,
      recordedBy: meterData.recordedBy,
      operatorName: meterData.operatorName,
      shift: meterData.shift,
      remarks: meterData.remarks,
      location: meterData.location,
      fuelFilled: meterData.fuelFilled,
      fuelCost: meterData.fuelCost
    },
  };

  return await MachineryAssetModel.findOneAndUpdate({ assetId }, update, { new: true });
}

// Add new trip details entry
static async addTripDetails(assetId, tripData) {
  return await MachineryAssetModel.findOneAndUpdate(
    { assetId },
    { $push: { tripHistory: tripData } },
    { new: true }
  );
}


}

export default new MachineryAssetService();
