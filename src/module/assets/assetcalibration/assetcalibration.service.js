import AssetCalibrationModel from "./assetcalibration.model.js";
import TaggedAssetModel from "../taggedasset/taggedasset.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

class AssetCalibrationService {
  static async createCalibration(data, userId) {
    const asset = await TaggedAssetModel.findById(data.asset_ref);
    if (!asset) throw new Error("Tagged asset not found");
    if (asset.is_deleted) throw new Error("Asset is retired");

    const calibration_id =
      data.calibration_id || (await IdcodeServices.generateCode("ASSET_CALIBRATION"));

    const exists = await AssetCalibrationModel.findOne({ calibration_id });
    if (exists) throw new Error(`Calibration '${calibration_id}' already exists`);

    const doc = new AssetCalibrationModel({
      ...data,
      calibration_id,
      asset_id_label: asset.asset_id,
      asset_name: asset.asset_name,
      asset_class: asset.asset_class,
      created_by: userId,
    });
    await doc.save();

    // Refresh the compliance summary on the asset so future "due" queries are fast.
    asset.compliance = asset.compliance || {};
    asset.compliance.requires_calibration = true;
    asset.compliance.last_calibration_date = doc.calibration_date;
    asset.compliance.next_calibration_due = doc.next_due_date;
    asset.compliance.last_certificate_number = doc.certificate_number;
    asset.compliance.last_certificate_url = doc.certificate_url;
    asset.updated_by = userId;
    await asset.save();

    return doc;
  }

  static async getAll(query = {}) {
    const { page = 1, limit = 20, asset_ref, asset_id_label, result, from, to } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};
    if (asset_ref) filter.asset_ref = asset_ref;
    if (asset_id_label) filter.asset_id_label = asset_id_label;
    if (result) filter.result = result;
    if (from || to) {
      filter.calibration_date = {};
      if (from) filter.calibration_date.$gte = new Date(from);
      if (to) filter.calibration_date.$lte = new Date(to);
    }
    const [data, total] = await Promise.all([
      AssetCalibrationModel.find(filter)
        .sort({ calibration_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AssetCalibrationModel.countDocuments(filter),
    ]);
    return {
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  static async getByCalibrationId(calibration_id) {
    const record = await AssetCalibrationModel.findOne({ calibration_id });
    if (!record) throw new Error("Calibration record not found");
    return record;
  }

  static async getHistoryForAsset(asset_id_label) {
    return await AssetCalibrationModel.find({ asset_id_label }).sort({ calibration_date: -1 });
  }

  static async update(calibration_id, data, userId) {
    data.updated_by = userId;
    const updated = await AssetCalibrationModel.findOneAndUpdate({ calibration_id }, data, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new Error("Calibration record not found");

    // If we updated the date / cert, refresh the asset summary too.
    const asset = await TaggedAssetModel.findById(updated.asset_ref);
    if (asset) {
      const latest = await AssetCalibrationModel.findOne({ asset_ref: updated.asset_ref }).sort({
        calibration_date: -1,
      });
      asset.compliance = asset.compliance || {};
      asset.compliance.last_calibration_date = latest.calibration_date;
      asset.compliance.next_calibration_due = latest.next_due_date;
      asset.compliance.last_certificate_number = latest.certificate_number;
      asset.compliance.last_certificate_url = latest.certificate_url;
      asset.updated_by = userId;
      await asset.save();
    }

    return updated;
  }

  static async deleteCalibration(calibration_id, userId) {
    const deleted = await AssetCalibrationModel.findOneAndDelete({ calibration_id });
    if (!deleted) throw new Error("Calibration record not found");

    // Recompute the asset's compliance summary from the most-recent remaining record.
    const asset = await TaggedAssetModel.findById(deleted.asset_ref);
    if (asset) {
      const latest = await AssetCalibrationModel.findOne({ asset_ref: deleted.asset_ref }).sort({
        calibration_date: -1,
      });
      asset.compliance = asset.compliance || {};
      if (latest) {
        asset.compliance.last_calibration_date = latest.calibration_date;
        asset.compliance.next_calibration_due = latest.next_due_date;
        asset.compliance.last_certificate_number = latest.certificate_number;
        asset.compliance.last_certificate_url = latest.certificate_url;
      } else {
        asset.compliance.last_calibration_date = null;
        asset.compliance.next_calibration_due = null;
        asset.compliance.last_certificate_number = null;
        asset.compliance.last_certificate_url = null;
      }
      asset.updated_by = userId;
      await asset.save();
    }
    return deleted;
  }

  // Items whose next_due_date is within `days` (default 30) — covers overdue too.
  static async getDueReport(days = 30) {
    const target = new Date();
    target.setDate(target.getDate() + Number(days));
    return await AssetCalibrationModel.aggregate([
      {
        $sort: { asset_ref: 1, calibration_date: -1 },
      },
      {
        $group: {
          _id: "$asset_ref",
          latest: { $first: "$$ROOT" },
        },
      },
      { $match: { "latest.next_due_date": { $lte: target } } },
      { $replaceRoot: { newRoot: "$latest" } },
      { $sort: { next_due_date: 1 } },
    ]);
  }
}

export default AssetCalibrationService;
