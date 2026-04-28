import AssetCategoryMasterModel from "./assetcategory.model.js";
import { ASSET_CATEGORY_SEED, buildCode } from "./assetcategory.seed.js";

class AssetCategoryService {
  static async createCategory(data) {
    const code = (data.code || buildCode(data)).toUpperCase();

    const existsCode = await AssetCategoryMasterModel.findOne({ code });
    if (existsCode) throw new Error(`Asset category code '${code}' already exists`);

    const existsPair = await AssetCategoryMasterModel.findOne({
      category: data.category,
      subCategory: data.subCategory || null,
    });
    if (existsPair) {
      throw new Error(
        `Asset category '${data.category}${data.subCategory ? " / " + data.subCategory : ""}' already exists`
      );
    }

    const record = new AssetCategoryMasterModel({ ...data, code });
    return await record.save();
  }

  static async getAll(query = {}) {
    const { page = 1, limit = 50, search = "", assetClass, isActive } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (assetClass) filter.assetClass = assetClass;
    if (isActive !== undefined) filter.isActive = isActive === "true" || isActive === true;

    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { code: { $regex: safe, $options: "i" } },
        { category: { $regex: safe, $options: "i" } },
        { subCategory: { $regex: safe, $options: "i" } },
      ];
    }

    const [data, total] = await Promise.all([
      AssetCategoryMasterModel.find(filter)
        .sort({ assetClass: 1, category: 1, subCategory: 1 })
        .skip(skip)
        .limit(Number(limit)),
      AssetCategoryMasterModel.countDocuments(filter),
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

  // Grouped output: { Machinery: { Earthmoving: [...], Lifting: [...] }, Vehicle: {...} }
  // Useful for cascading dropdowns on the asset-create form.
  static async getGrouped() {
    const rows = await AssetCategoryMasterModel.find({ isActive: true })
      .sort({ assetClass: 1, category: 1, subCategory: 1 })
      .lean();

    const grouped = {};
    for (const r of rows) {
      grouped[r.assetClass] ??= {};
      grouped[r.assetClass][r.category] ??= [];
      grouped[r.assetClass][r.category].push(r);
    }
    return grouped;
  }

  static async getById(id) {
    const record = await AssetCategoryMasterModel.findById(id);
    if (!record) throw new Error("Asset category not found");
    return record;
  }

  static async getByCode(code) {
    const record = await AssetCategoryMasterModel.findOne({ code: String(code).toUpperCase() });
    if (!record) throw new Error("Asset category not found");
    return record;
  }

  static async update(id, updateData) {
    if (updateData.code) {
      const dup = await AssetCategoryMasterModel.findOne({
        code: updateData.code.toUpperCase(),
        _id: { $ne: id },
      });
      if (dup) throw new Error(`Code '${updateData.code}' is already in use`);
    }
    const updated = await AssetCategoryMasterModel.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new Error("Asset category not found");
    return updated;
  }

  static async deleteById(id) {
    const deleted = await AssetCategoryMasterModel.findByIdAndDelete(id);
    if (!deleted) throw new Error("Asset category not found");
    return deleted;
  }

  static async toggleStatus(id) {
    const record = await AssetCategoryMasterModel.findById(id);
    if (!record) throw new Error("Asset category not found");
    record.isActive = !record.isActive;
    return await record.save();
  }

  // Idempotent seed — inserts only entries whose generated code doesn't exist yet.
  // Safe to run multiple times. Returns a summary of what changed.
  static async seedDefaults() {
    const ops = ASSET_CATEGORY_SEED.map((entry) => {
      const code = buildCode(entry);
      return {
        updateOne: {
          filter: { code },
          update: { $setOnInsert: { ...entry, code } },
          upsert: true,
        },
      };
    });

    if (ops.length === 0) return { totalSeed: 0, inserted: 0, existing: 0 };

    const result = await AssetCategoryMasterModel.bulkWrite(ops, { ordered: false });
    const inserted = result.upsertedCount || 0;
    return {
      totalSeed: ASSET_CATEGORY_SEED.length,
      inserted,
      existing: ASSET_CATEGORY_SEED.length - inserted,
    };
  }
}

export default AssetCategoryService;
