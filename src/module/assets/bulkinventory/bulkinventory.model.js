import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// BulkInventory — quantity-tracked stock that isn't serial-tagged.
// Covers: Formwork plates, Scaffolding, PPE (helmets, shoes, harnesses),
// fencing, tarpaulin, life-lines, safety nets, plywood sheets, props.
//
// Stock is tracked per-location so the same item can sit in multiple sites/stores.
// Movements (receipts, issues, returns, damage, scrap, transfers) are recorded
// in a separate BulkInventoryTransaction collection — this model holds only the
// current rollup. The service layer keeps the rollup consistent atomically.

const StockLocationSubSchema = new Schema(
  {
    location_type: { type: String, enum: ["SITE", "STORE"], required: true },
    location_id: { type: String, required: true },     // projectId or storeId
    location_name: { type: String, required: true },

    qty_available: { type: Number, default: 0, min: 0 }, // free stock in this location
    qty_in_use: { type: Number, default: 0, min: 0 },    // issued out, not yet returned
    qty_damaged: { type: Number, default: 0, min: 0 },   // damaged, awaiting scrap/repair
  },
  { _id: false }
);

const BulkInventorySchema = new mongoose.Schema(
  {
    item_id: { type: String, required: true, unique: true, index: true }, // e.g. "BLK001"
    item_name: { type: String, required: true, trim: true },

    // Classification
    asset_category_ref: { type: Schema.Types.ObjectId, ref: "AssetCategoryMaster", required: true, index: true },
    asset_class: {
      type: String,
      enum: ["Formwork", "SafetyEquipment", "SiteInfra", "Tool", "Other"],
      required: true,
      index: true,
    },
    category: { type: String, trim: true, index: true },
    sub_category: { type: String, trim: true },

    // Item attributes
    brand: { type: String, trim: true },
    model: { type: String, trim: true },
    size: { type: String, trim: true }, // "L", "8x4", "12mm" etc.
    color: { type: String, trim: true },
    unit_of_measure: { type: String, required: true, trim: true }, // "Nos", "Pair", "Mtr", "Sqm", "Set"

    // Stock
    stock_locations: { type: [StockLocationSubSchema], default: [] },

    // Rollups — kept in sync by the service on every transaction
    total_qty_available: { type: Number, default: 0, min: 0 },
    total_qty_in_use: { type: Number, default: 0, min: 0 },
    total_qty_damaged: { type: Number, default: 0, min: 0 },

    // Reorder thresholds (alerting)
    min_stock_level: { type: Number, default: 0, min: 0 },
    reorder_qty: { type: Number, default: 0, min: 0 },

    // Cost
    standard_cost: { type: Number, min: 0 }, // per unit
    vendor_id: { type: String, trim: true },
    vendor_name: { type: String, trim: true },

    // Item flags
    is_reusable: { type: Boolean, default: false }, // formwork=true, PPE=false
    is_consumable: { type: Boolean, default: true },
    has_expiry: { type: Boolean, default: false },
    shelf_life_months: { type: Number, min: 0 },

    // Compliance for PPE certifications etc.
    certifications: [String], // ["IS 2925", "EN 397"]

    notes: String,
    is_active: { type: Boolean, default: true, index: true },

    // Audit
    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

BulkInventorySchema.index({ asset_class: 1, is_active: 1 });
BulkInventorySchema.index({ "stock_locations.location_id": 1 });

BulkInventorySchema.plugin(auditPlugin, {
  entity_type: "BulkInventory",
  entity_no_field: "item_id",
});

const BulkInventoryModel = mongoose.model("BulkInventory", BulkInventorySchema);
export default BulkInventoryModel;
