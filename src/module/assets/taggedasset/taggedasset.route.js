import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createTaggedAsset,
  getAllTaggedAssets,
  getTaggedAssetById,
  updateTaggedAsset,
  updateTaggedAssetStatus,
  transferTaggedAsset,
  deleteTaggedAsset,
  getCalibrationDueAssets,
  getTaggedAssetSummary,
} from "./taggedasset.controller.js";

const taggedAssetRouter = express.Router();

// All asset endpoints sit under settings.assets RBAC.
taggedAssetRouter.use(verifyJWT);

taggedAssetRouter.post("/create",                   verifyPermission("asset", "tagged_asset", "create"), createTaggedAsset);
taggedAssetRouter.get("/getall",                    verifyPermission("asset", "tagged_asset", "read"),   getAllTaggedAssets);
taggedAssetRouter.get("/summary",                   verifyPermission("asset", "tagged_asset", "read"),   getTaggedAssetSummary);
taggedAssetRouter.get("/calibration-due",           verifyPermission("asset", "tagged_asset", "read"),   getCalibrationDueAssets);
taggedAssetRouter.get("/getbyid/:assetId",          verifyPermission("asset", "tagged_asset", "read"),   getTaggedAssetById);
taggedAssetRouter.put("/update/:assetId",           verifyPermission("asset", "tagged_asset", "edit"),   updateTaggedAsset);
taggedAssetRouter.patch("/status/:assetId",         verifyPermission("asset", "tagged_asset", "edit"),   updateTaggedAssetStatus);
taggedAssetRouter.put("/transfer/:assetId",         verifyPermission("asset", "tagged_asset", "edit"),   transferTaggedAsset);
taggedAssetRouter.delete("/delete/:assetId",        verifyPermission("asset", "tagged_asset", "delete"), deleteTaggedAsset);

export default taggedAssetRouter;
