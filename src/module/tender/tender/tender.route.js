import { Router } from "express";
import {
  createTender,
  getAllTenders,
  getTenderById,
  updateTender,
  deleteTender,
  updateTenderStatusCheck
} from "./tender.controller.js";

const tenderrouter = Router();

// CRUD
tenderrouter.post("/add", createTender);
tenderrouter.get("/all", getAllTenders);
tenderrouter.get("/get/:tender_id", getTenderById);
tenderrouter.put("/update/:tender_id", updateTender);
tenderrouter.delete("/delete/:tender_id", deleteTender);

// Special endpoint for tender_status_check
tenderrouter.put("/statuscheck/:tender_id", updateTenderStatusCheck);

export default tenderrouter;
