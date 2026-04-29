import MachineDailyLog from "../machinerylogs/machinerylogs.model.js";
import MaintenanceLog from "../maintainencelog/maintainencelog.model.js";
import MachineryAsset from "./machineryasset.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import { AppError } from "../../../common/AppError.js";

const NOT_DELETED = { isDeleted: { $ne: true } };

class MachineryAssetService {

  // 1. Create New Asset
  // Atomic: generate (or accept) the assetId then attempt insert. Duplicate-key
  // error is caught and surfaced as a 409 — eliminates the read-then-write race.
  static async addMachineryAsset(data, userId) {
    const assetId =
      data.assetId || (await IdcodeServices.generateCode("MACHINERY_ASSET"));

    try {
      const asset = await MachineryAsset.create({
        ...data,
        assetId,
        created_by: userId,
      });
      return asset;
    } catch (err) {
      if (err && err.code === 11000) {
        throw new AppError(
          `A machinery asset with ID '${assetId}' already exists`,
          409,
          "DUPLICATE_ASSET_ID"
        );
      }
      throw err;
    }
  }

  // 2. Get Single Asset (By assetId)
  static async getAssetByAssetId(assetId) {
    return await MachineryAsset.findOne({ assetId, ...NOT_DELETED });
  }

  // 3. Update Asset (By assetId)
  static async updateAssetDetails(assetId, updateData) {
    return await MachineryAsset.findOneAndUpdate(
      { assetId, ...NOT_DELETED },
      updateData,
      { new: true }
    );
  }

  // 4. Get Full History (Aggregation using assetId)
  static async getAssetHistory(assetId) {
    const asset = await MachineryAsset.findOne({ assetId, ...NOT_DELETED }).lean();
    if (!asset) return null;

    const logs = await MachineDailyLog.find({ assetId: asset._id })
      .sort({ logDate: -1 })
      .limit(30);
    const maintenance = await MaintenanceLog.find({ assetId }).sort({ date: -1 });

    return { ...asset, dailyLogs: logs, maintenanceHistory: maintenance };
  }

  // 5. Transfer Asset
  static async transferAsset(assetId, projectId, currentSite) {
    return await MachineryAsset.findOneAndUpdate(
      { assetId, ...NOT_DELETED },
      { projectId, currentSite },
      { new: true }
    );
  }

  static async getAssets(query = {}) {
    const filter = { ...NOT_DELETED };
    if (query.currentStatus) filter.currentStatus = query.currentStatus;
    if (query.assetType)     filter.assetType     = query.assetType;
    if (query.projectId)     filter.projectId     = query.projectId;
    if (query.vendorId)      filter.vendorId      = query.vendorId;
    return await MachineryAsset.find(filter).sort({ assetId: 1 });
  }

  // 7. Update Operational Status
  static async updateAssetStatus(assetId, status, remarks) {
    return await MachineryAsset.findOneAndUpdate(
      { assetId, ...NOT_DELETED },
      { currentStatus: status, remarks },
      { new: true }
    );
  }

  // 8. Expiry Alerts API
  static async getExpiryAlerts(days = 30) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(days));
    const query = {
      ...NOT_DELETED,
      $or: [
        { "compliance.insuranceExpiry":   { $lte: targetDate, $ne: null } },
        { "compliance.fitnessCertExpiry": { $lte: targetDate, $ne: null } },
        { "compliance.pollutionCertExpiry":{ $lte: targetDate, $ne: null } },
        { "compliance.roadTaxExpiry":     { $lte: targetDate, $ne: null } },
        { "compliance.permitExpiry":      { $lte: targetDate, $ne: null } },
      ],
    };
    return await MachineryAsset.find(query).select(
      "assetName assetId compliance projectId"
    );
  }

  // 9. Get Assets by Project ID
  static async getAssetsByProjectId(projectId) {
    return await MachineryAsset.find({ projectId, ...NOT_DELETED });
  }

  static async getAssetsByProjectIdSelect(projectId) {
    return await MachineryAsset.find({ projectId, ...NOT_DELETED }).select(
      "assetName assetId"
    );
  }

  // 10. Soft-delete (retire) — preserves history while hiding from operational queries
  static async softDelete(assetId, userId) {
    const updated = await MachineryAsset.findOneAndUpdate(
      { assetId, ...NOT_DELETED },
      { isDeleted: true, deletedAt: new Date(), currentStatus: "Scrapped" },
      { new: true }
    );
    if (!updated) throw new AppError("Machinery asset not found", 404, "NOT_FOUND");
    return updated;
  }

  // ── Sub-component (tyre/battery/etc.) CRUD ──────────────────────────────
  static async addSubComponent(assetId, data) {
    const updated = await MachineryAsset.findOneAndUpdate(
      { assetId, ...NOT_DELETED },
      { $push: { subComponents: data } },
      { new: true }
    );
    if (!updated) throw new AppError("Machinery asset not found", 404, "NOT_FOUND");
    return updated.subComponents[updated.subComponents.length - 1];
  }

  static async replaceSubComponent(assetId, subId, data) {
    const asset = await MachineryAsset.findOne({ assetId, ...NOT_DELETED });
    if (!asset) throw new AppError("Machinery asset not found", 404, "NOT_FOUND");
    const sub = asset.subComponents.id(subId);
    if (!sub) throw new AppError("Sub-component not found", 404, "NOT_FOUND");

    sub.replacedOn = data.replacedOn || new Date();
    sub.replacedAtReading = data.replacedAtReading ?? asset.lastReading;
    sub.replacementReason = data.replacementReason || "WORN_OUT";
    sub.status = "REPLACED";
    sub.notes = data.notes || sub.notes;

    if (data.newComponent) {
      asset.subComponents.push({
        ...data.newComponent,
        installedOn: data.newComponent.installedOn || new Date(),
        installedAtReading: data.newComponent.installedAtReading ?? asset.lastReading,
      });
    }
    await asset.save();
    return asset;
  }

  static async listSubComponents(assetId, { activeOnly = false } = {}) {
    const asset = await MachineryAsset.findOne({ assetId, ...NOT_DELETED }).select("subComponents lastReading");
    if (!asset) throw new AppError("Machinery asset not found", 404, "NOT_FOUND");
    const subs = activeOnly
      ? asset.subComponents.filter((s) => s.status === "ACTIVE")
      : asset.subComponents;
    // Add wear% calc
    return subs.map((s) => {
      const obj = s.toObject ? s.toObject() : s;
      const usedHours = obj.expectedLifeHours
        ? Math.max(0, (asset.lastReading - obj.installedAtReading) / obj.expectedLifeHours) * 100
        : null;
      const usedMonths = obj.expectedLifeMonths
        ? Math.max(0, (Date.now() - new Date(obj.installedOn).getTime()) / (1000 * 60 * 60 * 24 * 30)) /
            obj.expectedLifeMonths *
            100
        : null;
      const wearPercent = [usedHours, usedMonths]
        .filter((v) => v != null)
        .reduce((a, b) => Math.max(a, b), -Infinity);
      return { ...obj, wearPercent: wearPercent === -Infinity ? null : Number(wearPercent.toFixed(1)) };
    });
  }
}

export default MachineryAssetService;
