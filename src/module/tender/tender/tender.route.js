import { Router } from "express";
import {
  createTender,
  getAllTenders,
  getTenderById,
  updateTender,
  deleteTender,
  updateTenderStatusCheck,
  getTendersPaginated,
  getTenderForOverview,
  addImportantDate,
  getTenderByIdemd
} from "./tender.controller.js";

const tenderrouter = Router();

// CRUD
tenderrouter.post("/addtender", createTender);
tenderrouter.get("/all", getAllTenders);
tenderrouter.get("/gettender/:tender_id", getTenderById);
tenderrouter.get("/gettenderemd/:tender_id", getTenderByIdemd);
tenderrouter.put("/updatetender/:tender_id", updateTender);
tenderrouter.delete("/delete/:tender_id", deleteTender);
tenderrouter.get("/gettenders", getTendersPaginated);
tenderrouter.get("/getoverview/:tender_id", getTenderForOverview);
tenderrouter.post("/addfollowup/:tender_id", addImportantDate);


// Special endpoint for tender_status_check
tenderrouter.put("/statuscheck/:tender_id", updateTenderStatusCheck);

export default tenderrouter;
