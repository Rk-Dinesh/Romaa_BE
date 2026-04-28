import mongoose from "mongoose";
import BulkInventoryModel from "./bulkinventory.model.js";
import BulkInventoryTransactionModel from "./bulkinventorytxn.model.js";
import AssetCategoryMasterModel from "../../master/assetcategory/assetcategory.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

class BulkInventoryService {
  static async _resolveCategory(asset_category_ref) {
    if (!asset_category_ref) throw new Error("asset_category_ref is required");
    const cat = await AssetCategoryMasterModel.findById(asset_category_ref);
    if (!cat) throw new Error("Asset category not found in master");
    if (!cat.isActive) throw new Error("Asset category is inactive");
    return {
      asset_class: cat.assetClass,
      category: cat.category,
      sub_category: cat.subCategory,
      unit_of_measure: cat.defaultUnit,
      is_consumable: cat.isConsumable,
    };
  }

  // ── Item CRUD ────────────────────────────────────────────────────────────
  static async createItem(data, userId) {
    const denorm = await BulkInventoryService._resolveCategory(data.asset_category_ref);
    const item_id = data.item_id || (await IdcodeServices.generateCode("BULK_INVENTORY"));
    const exists = await BulkInventoryModel.findOne({ item_id });
    if (exists) throw new Error(`Bulk inventory item '${item_id}' already exists`);

    const doc = new BulkInventoryModel({
      ...data,
      item_id,
      // master fields take precedence for class/category, but the user's UoM wins if provided
      asset_class: denorm.asset_class,
      category: denorm.category,
      sub_category: denorm.sub_category,
      unit_of_measure: data.unit_of_measure || denorm.unit_of_measure,
      is_consumable: data.is_consumable ?? denorm.is_consumable,
      created_by: userId,
    });
    return await doc.save();
  }

  static async getAll(query = {}) {
    const { page = 1, limit = 20, search = "", asset_class, is_active, location_id, low_stock } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};

    if (asset_class) filter.asset_class = asset_class;
    if (is_active !== undefined) filter.is_active = is_active === "true" || is_active === true;
    if (location_id) filter["stock_locations.location_id"] = location_id;

    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { item_id: { $regex: safe, $options: "i" } },
        { item_name: { $regex: safe, $options: "i" } },
        { brand: { $regex: safe, $options: "i" } },
        { model: { $regex: safe, $options: "i" } },
      ];
    }

    if (low_stock === "true") {
      filter.$expr = { $lt: ["$total_qty_available", "$min_stock_level"] };
    }

    const [data, total] = await Promise.all([
      BulkInventoryModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      BulkInventoryModel.countDocuments(filter),
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

  static async getByItemId(item_id) {
    const item = await BulkInventoryModel.findOne({ item_id });
    if (!item) throw new Error("Bulk inventory item not found");
    return item;
  }

  static async update(item_id, data, userId) {
    if (data.asset_category_ref) {
      const denorm = await BulkInventoryService._resolveCategory(data.asset_category_ref);
      data.asset_class = denorm.asset_class;
      data.category = denorm.category;
      data.sub_category = denorm.sub_category;
    }
    data.updated_by = userId;
    const updated = await BulkInventoryModel.findOneAndUpdate({ item_id }, data, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new Error("Bulk inventory item not found");
    return updated;
  }

  static async toggleActive(item_id, userId) {
    const item = await BulkInventoryModel.findOne({ item_id });
    if (!item) throw new Error("Bulk inventory item not found");
    item.is_active = !item.is_active;
    item.updated_by = userId;
    return await item.save();
  }

  // ── Stock movements ─────────────────────────────────────────────────────
  // Single source of truth for any quantity change. Uses a Mongo session so
  // the ledger row and the rollup update commit (or roll back) together.
  static async _postTransaction(payload, userId) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const item = await BulkInventoryModel.findOne({ _id: payload.item_ref })
          .session(session);
        if (!item) throw new Error("Bulk inventory item not found");

        const qty = Number(payload.quantity);
        if (!(qty > 0)) throw new Error("Quantity must be positive");

        BulkInventoryService._applyToStock(item, payload, qty);
        BulkInventoryService._recomputeTotals(item);
        await item.save({ session });

        const txn_id = payload.txn_id || (await IdcodeServices.generateCode("BULK_INV_TXN"));
        const [txn] = await BulkInventoryTransactionModel.create(
          [
            {
              ...payload,
              txn_id,
              item_id_label: item.item_id,
              item_name: item.item_name,
              total_cost:
                payload.total_cost ?? (payload.unit_cost ? payload.unit_cost * qty : undefined),
              performed_by: userId,
            },
          ],
          { session }
        );

        result = { transaction: txn, item };
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  // Mutates `item.stock_locations` in-place per transaction type.
  static _applyToStock(item, p, qty) {
    const upsertLocation = (locType, locId, locName) => {
      let entry = item.stock_locations.find(
        (l) => l.location_id === locId && l.location_type === locType
      );
      if (!entry) {
        entry = { location_type: locType, location_id: locId, location_name: locName };
        item.stock_locations.push(entry);
      }
      return entry;
    };

    const fromLoc =
      p.from_location_id && upsertLocation(p.from_location_type, p.from_location_id, p.from_location_name);
    const toLoc =
      p.to_location_id && upsertLocation(p.to_location_type, p.to_location_id, p.to_location_name);

    switch (p.txn_type) {
      case "RECEIPT": {
        if (!toLoc) throw new Error("RECEIPT requires to_location");
        toLoc.qty_available = (toLoc.qty_available || 0) + qty;
        break;
      }
      case "ISSUE": {
        if (!fromLoc) throw new Error("ISSUE requires from_location");
        if ((fromLoc.qty_available || 0) < qty)
          throw new Error(`Insufficient stock at ${fromLoc.location_name} (have ${fromLoc.qty_available}, need ${qty})`);
        fromLoc.qty_available -= qty;
        fromLoc.qty_in_use = (fromLoc.qty_in_use || 0) + qty;
        break;
      }
      case "RETURN": {
        if (!toLoc) throw new Error("RETURN requires to_location");
        if ((toLoc.qty_in_use || 0) < qty)
          throw new Error(`Cannot RETURN more than in-use at ${toLoc.location_name}`);
        toLoc.qty_in_use -= qty;
        toLoc.qty_available = (toLoc.qty_available || 0) + qty;
        break;
      }
      case "TRANSFER": {
        if (!fromLoc || !toLoc) throw new Error("TRANSFER requires from and to locations");
        if ((fromLoc.qty_available || 0) < qty)
          throw new Error(`Insufficient stock at ${fromLoc.location_name}`);
        fromLoc.qty_available -= qty;
        toLoc.qty_available = (toLoc.qty_available || 0) + qty;
        break;
      }
      case "DAMAGE": {
        if (!fromLoc) throw new Error("DAMAGE requires from_location");
        // Move from available (or in_use) → damaged at same location
        if ((fromLoc.qty_available || 0) >= qty) {
          fromLoc.qty_available -= qty;
        } else if ((fromLoc.qty_in_use || 0) >= qty) {
          fromLoc.qty_in_use -= qty;
        } else {
          throw new Error(`Insufficient stock at ${fromLoc.location_name} to mark damaged`);
        }
        fromLoc.qty_damaged = (fromLoc.qty_damaged || 0) + qty;
        break;
      }
      case "SCRAP": {
        if (!fromLoc) throw new Error("SCRAP requires from_location");
        // Scrap removes from damaged stock entirely
        if ((fromLoc.qty_damaged || 0) < qty)
          throw new Error(`Insufficient damaged stock at ${fromLoc.location_name} to scrap`);
        fromLoc.qty_damaged -= qty;
        break;
      }
      case "ADJUSTMENT": {
        // free-form adjustment — quantity is signed via fromLoc/toLoc semantics:
        // if to_location is provided → add qty there; if from_location → remove qty there
        if (toLoc) toLoc.qty_available = (toLoc.qty_available || 0) + qty;
        else if (fromLoc) {
          if ((fromLoc.qty_available || 0) < qty)
            throw new Error(`Insufficient stock at ${fromLoc.location_name}`);
          fromLoc.qty_available -= qty;
        } else {
          throw new Error("ADJUSTMENT requires either from or to location");
        }
        break;
      }
      default:
        throw new Error(`Unsupported txn_type: ${p.txn_type}`);
    }
  }

  static _recomputeTotals(item) {
    let avail = 0,
      inUse = 0,
      dmg = 0;
    for (const l of item.stock_locations) {
      avail += l.qty_available || 0;
      inUse += l.qty_in_use || 0;
      dmg += l.qty_damaged || 0;
    }
    item.total_qty_available = avail;
    item.total_qty_in_use = inUse;
    item.total_qty_damaged = dmg;
  }

  // Public movement helpers — thin wrappers around _postTransaction so callers
  // can't accidentally pass an unsupported txn_type.
  static async receive(payload, userId) {
    return BulkInventoryService._postTransaction({ ...payload, txn_type: "RECEIPT" }, userId);
  }
  static async issue(payload, userId) {
    return BulkInventoryService._postTransaction({ ...payload, txn_type: "ISSUE" }, userId);
  }
  static async receiveReturn(payload, userId) {
    return BulkInventoryService._postTransaction({ ...payload, txn_type: "RETURN" }, userId);
  }
  static async transfer(payload, userId) {
    return BulkInventoryService._postTransaction({ ...payload, txn_type: "TRANSFER" }, userId);
  }
  static async markDamaged(payload, userId) {
    return BulkInventoryService._postTransaction({ ...payload, txn_type: "DAMAGE" }, userId);
  }
  static async scrap(payload, userId) {
    return BulkInventoryService._postTransaction({ ...payload, txn_type: "SCRAP" }, userId);
  }
  static async adjust(payload, userId) {
    return BulkInventoryService._postTransaction({ ...payload, txn_type: "ADJUSTMENT" }, userId);
  }

  // ── Reads on the ledger ──────────────────────────────────────────────────
  static async getTransactions(query = {}) {
    const { page = 1, limit = 20, item_id_label, txn_type, from, to } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};
    if (item_id_label) filter.item_id_label = item_id_label;
    if (txn_type) filter.txn_type = txn_type;
    if (from || to) {
      filter.txn_date = {};
      if (from) filter.txn_date.$gte = new Date(from);
      if (to) filter.txn_date.$lte = new Date(to);
    }
    const [data, total] = await Promise.all([
      BulkInventoryTransactionModel.find(filter).sort({ txn_date: -1 }).skip(skip).limit(Number(limit)),
      BulkInventoryTransactionModel.countDocuments(filter),
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

  static async getLowStockItems() {
    return await BulkInventoryModel.find({
      is_active: true,
      $expr: { $lt: ["$total_qty_available", "$min_stock_level"] },
    }).select("item_id item_name asset_class min_stock_level total_qty_available reorder_qty");
  }
}

export default BulkInventoryService;
