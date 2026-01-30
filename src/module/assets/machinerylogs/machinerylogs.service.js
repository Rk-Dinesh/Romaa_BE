import mongoose from "mongoose";
import MachineDailyLog from "./machinerylogs.model.js";
import MachineryAsset from "../machinery/machineryasset.model.js";


class MachineLogService {
  /**
   * Create multiple log entries at once
   * @param {Array} logsArray - Array of log objects
   * @param {String} userId - ID of the user creating the logs (optional, for supervisor/operator)
   */
  static async bulkCreateLogs(logsArray, userId) {
    if (!Array.isArray(logsArray) || logsArray.length === 0) {
      throw new Error("No logs provided for creation.");
    }

    // 1. Process and sanitize each log entry before saving
    const processedLogs = logsArray.map((log) => {
      let netUsage = log.netUsage;
      if (log.endReading !== undefined && log.startReading !== undefined) {
        netUsage = log.endReading - log.startReading;
      }

      let fuelConsumed = log.fuelConsumed;
      if (
        log.fuelOpening !== undefined &&
        log.fuelIssued !== undefined &&
        log.fuelClosing !== undefined
      ) {
        fuelConsumed = (Number(log.fuelOpening) + Number(log.fuelIssued)) - Number(log.fuelClosing);
      }

      let quantity = log.quantity || 0;
      if (!quantity && log.length && log.breadth && log.depth) {
        quantity = log.length * log.breadth * log.depth;
      }

      return {
        ...log,
        netUsage,
        fuelConsumed,
        quantity,
        // supervisorSignOff: userId, 
      };
    });

    // 2. Bulk Insert using Mongoose
    const result = await MachineDailyLog.insertMany(processedLogs, { ordered: false });
    
    return result;
  }
static async getLogsByProject(projectId, startDate, endDate) {
    const query = { projectId };
    if (startDate && endDate) {
      query.logDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // 1. Fetch logs with populated fields
    const logs = await MachineDailyLog.find(query)
      .populate({
        path: "assetId",
        select: "assetName", 
      })
      .populate({
        path: "bid_id",
        select: "items.item_id items.item_name", // We fetch this ONLY to perform the lookup below
      })
      .sort({ logDate: -1 })
      .lean(); 

    // 2. Process logs
    const processedLogs = logs.map((log) => {
      // A. Handle Asset
      const assetObj = log.assetId;
      const assetName = assetObj ? assetObj.assetName : "Unknown Asset";
      const assetIdSimple = assetObj ? assetObj._id : log.assetId;

      // B. Handle Item Name Logic
      let itemName = "Unknown Item";
      const bidObj = log.bid_id;
      const bidIdSimple = bidObj ? bidObj._id : log.bid_id; // Capture just the ID string

      // Perform the lookup inside the populated object
      if (bidObj && Array.isArray(bidObj.items)) {
        const matchedItem = bidObj.items.find(
          (item) => item.item_id === log.item_id
        );
        if (matchedItem) {
          itemName = matchedItem.item_name;
        }
      }

      // C. Return flattened object
      return {
        ...log,
        assetId: assetIdSimple, // Overwrite object with simple ID string
        bid_id: bidIdSimple,    // Overwrite object with simple ID string (Removes the heavy items array)
        assetName: assetName,   // New Field
        itemName: itemName,     // New Field
      };
    });

    return processedLogs;
  }

static async getAllLogs({ projectId, startDate, endDate, assetName }) {
    const query = {};

    // 1. Filter by Project ID (Only if provided and not empty)
    if (projectId && projectId.trim() !== "") {
      query.projectId = projectId;
    }

    // 2. Filter by Date Range (Only if both exist)
    if (startDate && endDate) {
      query.logDate = { 
        $gte: new Date(startDate), 
        $lte: new Date(new Date(endDate).setHours(23, 59, 59)) // Include full end day
      };
    }

    // 3. Filter by Asset Name (Cross-Collection)
    if (assetName && assetName.trim() !== "") {
      const matchedAssets = await MachineryAsset.find({ 
        assetName: { $regex: assetName, $options: "i" } 
      }).select("_id");

      const assetIds = matchedAssets.map(a => a._id);
      
      // Optimization: If searched name doesn't exist, return empty immediately
      if (assetIds.length === 0) return [];

      query.assetId = { $in: assetIds };
    }

    // 4. Fetch & Populate
    const logs = await MachineDailyLog.find(query)
      .populate({ path: "assetId", select: "assetName" })
      .populate({ path: "bid_id", select: "items.item_id items.item_name" })
      .sort({ logDate: -1 })
      .lean();

    // 5. Flatten Data
    return logs.map((log) => {
      const assetObj = log.assetId;
      const bidObj = log.bid_id;
      let itemName = "Unknown Item";

      if (bidObj && Array.isArray(bidObj.items)) {
        const matched = bidObj.items.find(i => i.item_id === log.item_id);
        if (matched) itemName = matched.item_name;
      }

      return {
        ...log,
        assetId: assetObj ? assetObj._id : log.assetId,
        bid_id: bidObj ? bidObj._id : log.bid_id,
        assetName: assetObj ? assetObj.assetName : "Unknown Asset",
        itemName,
      };
    });
  }
}

export default MachineLogService;