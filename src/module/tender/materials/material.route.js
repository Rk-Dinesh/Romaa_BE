import { Router } from "express";
import { 
  addMaterialReceived, 
  addMaterialIssued, 
  getStockStatus, 
  getItemLedger, 
  getMaterialList,
  getPOReceivedHistory,
  getMaterialInwardHistory
} from "./material.controller.js";

const materialRouter = Router();

materialRouter.post("/addMaterialReceived", addMaterialReceived);
materialRouter.post("/addMaterialIssued", addMaterialIssued);
materialRouter.get("/stock-status/:tender_id", getStockStatus); // Supports ?category=Cement
materialRouter.get("/ledger/:tender_id/:item_id", getItemLedger);
materialRouter.get("/list/:tender_id", getMaterialList);
materialRouter.get("/getPOReceivedHistory/:tender_id/:requestId", getPOReceivedHistory);
materialRouter.get("/getMaterialInwardHistory/:tender_id/:item_id", getMaterialInwardHistory);

export default materialRouter;