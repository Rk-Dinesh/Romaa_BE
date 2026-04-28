import TaggedAssetModel from "./taggedasset.model.js";
import AssetCategoryMasterModel from "../../master/assetcategory/assetcategory.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

const NOT_DELETED = { is_deleted: { $ne: true } };

class TaggedAssetService {
  // Resolve and validate the category master, then denormalize fields onto the asset.
  static async _resolveCategory(asset_category_ref) {
    if (!asset_category_ref) throw new Error("asset_category_ref is required");
    const cat = await AssetCategoryMasterModel.findById(asset_category_ref);
    if (!cat) throw new Error("Asset category not found in master");
    if (!cat.isActive) throw new Error("Asset category is inactive");
    return {
      asset_class: cat.assetClass,
      category: cat.category,
      sub_category: cat.subCategory,
    };
  }

  static async createAsset(data, userId) {
    const { asset_class, category, sub_category } = await TaggedAssetService._resolveCategory(
      data.asset_category_ref
    );

    const asset_id = data.asset_id || (await IdcodeServices.generateCode("TAGGED_ASSET"));
    const exists = await TaggedAssetModel.findOne({ asset_id });
    if (exists) throw new Error(`Tagged asset '${asset_id}' already exists`);

    const doc = new TaggedAssetModel({
      ...data,
      asset_id,
      asset_class,
      category,
      sub_category,
      created_by: userId,
    });
    return await doc.save();
  }

  static async getAll(query = {}) {
    const {
      page = 1,
      limit = 20,
      search = "",
      asset_class,
      status,
      condition,
      ownership,
      current_site_id,
      assigned_to_employee_id,
      include_deleted = false,
    } = query;

    const skip = (Number(page) - 1) * Number(limit);
    const filter = include_deleted === "true" ? {} : { ...NOT_DELETED };

    if (asset_class) filter.asset_class = asset_class;
    if (status) filter.status = status;
    if (condition) filter.condition = condition;
    if (ownership) filter.ownership = ownership;
    if (current_site_id) filter.current_site_id = current_site_id;
    if (assigned_to_employee_id) filter.assigned_to_employee_id = assigned_to_employee_id;

    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { asset_id: { $regex: safe, $options: "i" } },
        { asset_name: { $regex: safe, $options: "i" } },
        { serial_number: { $regex: safe, $options: "i" } },
        { qr_code: { $regex: safe, $options: "i" } },
        { rfid_tag: { $regex: safe, $options: "i" } },
      ];
    }

    const [data, total] = await Promise.all([
      TaggedAssetModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      TaggedAssetModel.countDocuments(filter),
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

  static async getByAssetId(asset_id) {
    const record = await TaggedAssetModel.findOne({ asset_id, ...NOT_DELETED });
    if (!record) throw new Error("Tagged asset not found");
    return record;
  }

  static async getById(id) {
    const record = await TaggedAssetModel.findOne({ _id: id, ...NOT_DELETED });
    if (!record) throw new Error("Tagged asset not found");
    return record;
  }

  static async update(asset_id, updateData, userId) {
    // If category is being changed, re-denormalize.
    if (updateData.asset_category_ref) {
      const denorm = await TaggedAssetService._resolveCategory(updateData.asset_category_ref);
      Object.assign(updateData, denorm);
    }
    updateData.updated_by = userId;
    const updated = await TaggedAssetModel.findOneAndUpdate(
      { asset_id, ...NOT_DELETED },
      updateData,
      { new: true, runValidators: true }
    );
    if (!updated) throw new Error("Tagged asset not found");
    return updated;
  }

  static async updateStatus(asset_id, status, notes, userId) {
    const updated = await TaggedAssetModel.findOneAndUpdate(
      { asset_id, ...NOT_DELETED },
      { status, ...(notes && { notes }), updated_by: userId },
      { new: true }
    );
    if (!updated) throw new Error("Tagged asset not found");
    return updated;
  }

  static async transfer(asset_id, { current_site_id, current_site_name, current_store_name, current_location_type }, userId) {
    const updated = await TaggedAssetModel.findOneAndUpdate(
      { asset_id, ...NOT_DELETED },
      {
        ...(current_location_type && { current_location_type }),
        ...(current_site_id && { current_site_id }),
        ...(current_site_name && { current_site_name }),
        ...(current_store_name && { current_store_name }),
        // moving location clears any stale custodian
        assigned_to_employee_id: null,
        assigned_to_employee_name: null,
        updated_by: userId,
      },
      { new: true }
    );
    if (!updated) throw new Error("Tagged asset not found");
    return updated;
  }

  static async softDelete(asset_id, userId) {
    const updated = await TaggedAssetModel.findOneAndUpdate(
      { asset_id, ...NOT_DELETED },
      { is_deleted: true, status: "SCRAPPED", updated_by: userId },
      { new: true }
    );
    if (!updated) throw new Error("Tagged asset not found");
    return updated;
  }

  // Calibration due in next N days (or already overdue)
  static async getCalibrationDue(days = 30) {
    const target = new Date();
    target.setDate(target.getDate() + Number(days));
    return await TaggedAssetModel.find({
      ...NOT_DELETED,
      "compliance.requires_calibration": true,
      "compliance.next_calibration_due": { $lte: target },
    }).select("asset_id asset_name asset_class compliance current_site_id current_site_name");
  }

  // Aggregation: count assets by class and status — handy for the assets dashboard tile.
  static async getSummary() {
    return await TaggedAssetModel.aggregate([
      { $match: NOT_DELETED },
      {
        $group: {
          _id: { asset_class: "$asset_class", status: "$status" },
          count: { $sum: 1 },
          total_value: { $sum: { $ifNull: ["$purchase_cost", 0] } },
        },
      },
      {
        $group: {
          _id: "$_id.asset_class",
          breakdown: { $push: { status: "$_id.status", count: "$count", value: "$total_value" } },
          total: { $sum: "$count" },
          total_value: { $sum: "$total_value" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }
}

export default TaggedAssetService;
