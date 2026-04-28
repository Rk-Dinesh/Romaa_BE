import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createAssetCategory,
  getAllAssetCategories,
  getGroupedAssetCategories,
  getAssetCategoryById,
  getAssetCategoryByCode,
  updateAssetCategory,
  deleteAssetCategory,
  toggleAssetCategoryStatus,
  seedAssetCategoryDefaults,
} from "./assetcategory.controller.js";

const assetCategoryRouter = express.Router();

assetCategoryRouter.use(verifyJWT);

assetCategoryRouter.post("/",                       verifyPermission("asset", "category_master", "create"), createAssetCategory);
assetCategoryRouter.post("/seed",                   verifyPermission("asset", "category_master", "create"), seedAssetCategoryDefaults);

assetCategoryRouter.get("/getall",                  verifyPermission("asset", "category_master", "read"),   getAllAssetCategories);
assetCategoryRouter.get("/grouped",                 verifyPermission("asset", "category_master", "read"),   getGroupedAssetCategories);
assetCategoryRouter.get("/getbyid/:id",             verifyPermission("asset", "category_master", "read"),   getAssetCategoryById);
assetCategoryRouter.get("/getbycode/:code",         verifyPermission("asset", "category_master", "read"),   getAssetCategoryByCode);

assetCategoryRouter.put("/update/:id",              verifyPermission("asset", "category_master", "edit"),   updateAssetCategory);
assetCategoryRouter.patch("/toggle-status/:id",     verifyPermission("asset", "category_master", "edit"),   toggleAssetCategoryStatus);
assetCategoryRouter.delete("/delete/:id",           verifyPermission("asset", "category_master", "delete"), deleteAssetCategory);

export default assetCategoryRouter;
