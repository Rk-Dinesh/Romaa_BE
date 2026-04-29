import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createMachineryAsset,
  getMachineryAsset,
  updateMachineryAsset,
  getAssetDashboard,
  transferMachineryAsset,
  updateAssetStatus,
  getAssets,
  getExpiryAlerts,
  getAssetsByProjectId,
  getAssetsByProjectIdSelect,
  softDeleteMachineryAsset,
} from "./machineryasset.controller.js";

const machineryrouter = express.Router();
machineryrouter.use(verifyJWT);

machineryrouter.post("/createasset",                          verifyPermission("asset", "machinery", "create"), createMachineryAsset);
machineryrouter.get("/getall/assets",                         verifyPermission("asset", "machinery", "read"),   getAssets);
machineryrouter.get("/expiry-alerts",                         verifyPermission("asset", "machinery", "read"),   getExpiryAlerts);
machineryrouter.get("/getbyid/:assetId",                      verifyPermission("asset", "machinery", "read"),   getMachineryAsset);
machineryrouter.get("/dashboard/:assetId",                    verifyPermission("asset", "machinery", "read"),   getAssetDashboard);
machineryrouter.get("/getbyproject/:projectId",               verifyPermission("asset", "machinery", "read"),   getAssetsByProjectId);
machineryrouter.get("/getbyprojectselect/:projectId",         verifyPermission("asset", "machinery", "read"),   getAssetsByProjectIdSelect);
machineryrouter.put("/update/:assetId",                       verifyPermission("asset", "machinery", "edit"),   updateMachineryAsset);
machineryrouter.put("/transfer/:assetId",                     verifyPermission("asset", "machinery", "edit"),   transferMachineryAsset);
machineryrouter.put("/status/:assetId",                       verifyPermission("asset", "machinery", "edit"),   updateAssetStatus);
machineryrouter.delete("/delete/:assetId",                    verifyPermission("asset", "machinery", "delete"), softDeleteMachineryAsset);

export default machineryrouter;
