import { Router } from "express";
import { 
  addMaterialReceived, 
  addMaterialIssued, 
  getStockStatus, 
  getItemLedger, 
  getMaterialList
} from "./material.controller.js";

const materialRouter = Router();

materialRouter.post("/received/add", addMaterialReceived);
materialRouter.post("/issued/add", addMaterialIssued);
materialRouter.get("/stock-status/:tender_id", getStockStatus); // Supports ?category=Cement
materialRouter.get("/ledger/:tender_id/:item_id", getItemLedger);
materialRouter.get("/list/:tender_id", getMaterialList);

export default materialRouter;