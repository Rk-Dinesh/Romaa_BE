import { Router } from "express";
import multer from "multer";
import {
  createBoq,
  getAllBoqs,
  getBoqById,
  updateBoq,
  addItemToBoq,
  removeItemFromBoq,
  deleteBoq,
  addOrUpdateBoqItem,
  getBoqItemsPaginated,
  getBoqByTenderId,
  uploadBoqCSV,
  getBoqItems,
  getDrawingQuantity,
  bulkUpdateDrawingQuantity,
} from "./boq.controller.js";

const boqrouter = Router();
const upload = multer({ dest: "uploads/" });

// BoQ CRUD
boqrouter.post("/add", createBoq);
boqrouter.post("/addboq", addOrUpdateBoqItem);

boqrouter.get("/all", getAllBoqs);
boqrouter.get("/get/:boq_id", getBoqById);
boqrouter.put("/update/:boq_id", updateBoq);
boqrouter.delete("/delete/:boq_id", deleteBoq);

// Add/Remove single items
boqrouter.post("/additem/:boq_id", addItemToBoq);
boqrouter.delete("/removeitem/:tender_id/:item_code", removeItemFromBoq);
boqrouter.get("/items/:tender_id", getBoqItemsPaginated); //in use
boqrouter.get("/by-tender/:tender_id", getBoqByTenderId);
boqrouter.post("/uploadcsv", upload.single("file"), uploadBoqCSV);

boqrouter.get("/get-items/:tender_id", getBoqItems); //in use
boqrouter.get("/get-drawing-quantity/:tender_id", getDrawingQuantity);
boqrouter.put("/bulk-update-drawing-quantity/:tender_id", bulkUpdateDrawingQuantity);

export default boqrouter;
