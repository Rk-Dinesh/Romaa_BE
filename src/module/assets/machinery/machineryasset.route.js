import express from "express";
import { createMachineryAsset, 
    getMachineryAsset, 
    updateMachineryAsset,
    getAssetDashboard,
    transferMachineryAsset,
    updateAssetStatus,
    getAssets,
    getExpiryAlerts,
    getAssetsByProjectId,
    getAssetsByProjectIdSelect
} from "./machineryasset.controller.js";


const machineryrouter = express.Router();

machineryrouter.post("/createasset", createMachineryAsset);
machineryrouter.get("/getbyid/:assetId", getMachineryAsset);
machineryrouter.put("/update/:assetId", updateMachineryAsset);
machineryrouter.get("/dashboard/:assetId", getAssetDashboard);
machineryrouter.put("/transfer/:assetId", transferMachineryAsset);
machineryrouter.put("/status/:assetId", updateAssetStatus);
machineryrouter.get("/getall/assets", getAssets);
machineryrouter.get("/expiry-alerts", getExpiryAlerts);
machineryrouter.get("/getbyproject/:projectId", getAssetsByProjectId);
machineryrouter.get("/getbyprojectselect/:projectId", getAssetsByProjectIdSelect);



export default machineryrouter;
