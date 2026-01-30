import MachineDailyLog from "../machinerylogs/machinerylogs.model.js";
import MaintenanceLog from "../maintainencelog/maintainencelog.model.js";
import MachineryAsset from "./machineryasset.model.js";

class MachineryAssetService {

  // 1. Create New Asset
  static async addMachineryAsset(data) {
    // Check if assetId already exists
    const exists = await MachineryAsset.findOne({ assetId: data.assetId });
    if (exists) throw new Error(`Asset ID ${data.assetId} already exists`);

    const asset = new MachineryAsset(data);
    return await asset.save();
  }

  // 2. Get Single Asset (By assetId)
  static async getAssetByAssetId(assetId) {
    return await MachineryAsset.findOne({ assetId: assetId });
  }

  // 3. Update Asset (By assetId)
  static async updateAssetDetails(assetId, updateData) {
    return await MachineryAsset.findOneAndUpdate(
      { assetId: assetId },
      updateData,
      { new: true }
    );
  }

  // 4. Get Full History (Aggregation using assetId)
  // This replaces "populate" since we are joining on a custom string field
  static async getAssetHistory(assetId) {
    const asset = await MachineryAsset.findOne({ assetId: assetId }).lean();
    if (!asset) return null;

    // Fetch Logs using the String ID
    const logs = await MachineDailyLog.find({ assetId: assetId }).sort({ logDate: -1 }).limit(30);
    const maintenance = await MaintenanceLog.find({ assetId: assetId }).sort({ date: -1 });

    return { ...asset, dailyLogs: logs, maintenanceHistory: maintenance };
  }

  // 5. Transfer Asset
  static async transferAsset(assetId, projectId, currentSite) {
    return await MachineryAsset.findOneAndUpdate(
      { assetId: assetId },
      { projectId, currentSite },
      { new: true }
    );
  }

  static async getAssets(query={}) {
    return await MachineryAsset.find(query).sort({ assetId: 1 });
  }

  // 7. Update Operational Status (Active, Breakdown, etc.)
  static async updateAssetStatus(assetId, status, remarks) {
    return await MachineryAsset.findOneAndUpdate(
      { assetId: assetId },
      { 
        currentStatus: status,
        remarks: remarks // Log why the status changed
      },
      { new: true }
    );
  }

  // 8. Expiry Alerts API (Compliance Check)
  // Finds items expiring within 'days' (default 30) or already expired
  static async getExpiryAlerts(days = 30) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(days));

    // Check all compliance fields
    const query = {
      $or: [
        { "compliance.insuranceExpiry": { $lte: targetDate, $ne: null } },
        { "compliance.fitnessCertExpiry": { $lte: targetDate, $ne: null } },
        { "compliance.pollutionCertExpiry": { $lte: targetDate, $ne: null } },
        { "compliance.roadTaxExpiry": { $lte: targetDate, $ne: null } },
        { "compliance.permitExpiry": { $lte: targetDate, $ne: null } }
      ]
    };

    return await MachineryAsset.find(query).select("assetName assetId compliance projectId");
  }

  // 9. Get Assets by Project ID
  static async getAssetsByProjectId(projectId) {
    return await MachineryAsset.find({ projectId: projectId });
  }

   static async getAssetsByProjectIdSelect(projectId) {
    return await MachineryAsset.find({ projectId: projectId }).select("assetName assetId ");
  }

}

export default MachineryAssetService;