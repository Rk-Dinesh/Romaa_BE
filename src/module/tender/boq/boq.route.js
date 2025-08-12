import { Router } from "express";
import {
  createBoq,
  getAllBoqs,
  getBoqById,
  updateBoq,
  addItemToBoq,
  removeItemFromBoq,
  deleteBoq
} from "./boq.controller.js";

const boqrouter = Router();

// BoQ CRUD
boqrouter.post("/add", createBoq);
boqrouter.get("/all", getAllBoqs);
boqrouter.get("/get/:boq_id", getBoqById);
boqrouter.put("/update/:boq_id", updateBoq);
boqrouter.delete("/delete/:boq_id", deleteBoq);

// Add/Remove single items
boqrouter.post("/additem/:boq_id", addItemToBoq);
boqrouter.delete("/removeitem/:boq_id/:item_code", removeItemFromBoq);

export default boqrouter;
