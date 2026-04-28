import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

const AssetCategoryMasterSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    assetClass: {
      type: String,
      enum: [
        "Machinery",
        "Vehicle",
        "StationaryPlant",
        "Tool",
        "Formwork",
        "SiteInfra",
        "SafetyEquipment",
        "Survey",
        "IT",
        "Furniture",
        "Other",
      ],
      required: true,
      index: true,
    },

    category: { type: String, required: true, trim: true, index: true },
    subCategory: { type: String, trim: true },

    description: { type: String, trim: true },

    trackingMode: {
      type: String,
      enum: ["HOURS", "KILOMETERS", "UNITS", "QUANTITY", "NONE"],
      default: "NONE",
    },

    defaultUnit: { type: String, trim: true },

    requiresCompliance: { type: Boolean, default: false },
    requiresFuel: { type: Boolean, default: false },
    requiresGps: { type: Boolean, default: false },
    requiresOperator: { type: Boolean, default: false },
    isConsumable: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

AssetCategoryMasterSchema.index({ assetClass: 1, isActive: 1 });
AssetCategoryMasterSchema.index({ category: 1, subCategory: 1 }, { unique: true });

AssetCategoryMasterSchema.plugin(auditPlugin, {
  entity_type: "AssetCategoryMaster",
  entity_no_field: "code",
});

const AssetCategoryMasterModel = mongoose.model(
  "AssetCategoryMaster",
  AssetCategoryMasterSchema
);
export default AssetCategoryMasterModel;
