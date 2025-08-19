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
  getTenderByIdemd,
  updateTenderWorkOrderController,
  getTenderByIdforApprove,
  checkTenderApprovalStatus,
  getTendersPaginatedWorkerOrder,
  getTendersPaginatedEMDSD,
  updateEmdDetails,
  updateSDDetails,
  getWorkOrdererForOverview
} from "./tender.controller.js";

const tenderrouter = Router();

// CRUD
tenderrouter.post("/addtender", createTender);
tenderrouter.get("/all", getAllTenders);
tenderrouter.get("/gettender/:tender_id", getTenderById);
tenderrouter.get("/gettenderforApprove/:tender_id", getTenderByIdforApprove);
tenderrouter.get("/gettenderemd/:tender_id", getTenderByIdemd);
tenderrouter.put("/updatetender/:tender_id", updateTender);
tenderrouter.delete("/delete/:tender_id", deleteTender);
tenderrouter.get("/gettenders", getTendersPaginated);
tenderrouter.get("/gettendersworkorder", getTendersPaginatedWorkerOrder);
tenderrouter.get("/gettendersemdsd", getTendersPaginatedEMDSD);
tenderrouter.get("/getoverview/:tender_id", getTenderForOverview);
tenderrouter.get("/getoverviewworkorder/:tender_id", getWorkOrdererForOverview);
tenderrouter.post("/addfollowup/:tender_id", addImportantDate);
tenderrouter.put("/update-workorder/:tender_id", updateTenderWorkOrderController);
tenderrouter.get("/approval-status/:tender_id", checkTenderApprovalStatus);
tenderrouter.post('/updateemdamount/:tender_id',updateEmdDetails);
tenderrouter.post('/securitydepositamount/:tender_id',updateSDDetails);


// Special endpoint for tender_status_check
tenderrouter.put("/statuscheck/:tender_id", updateTenderStatusCheck);

export default tenderrouter;
