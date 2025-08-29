import { Router } from "express";
import multer from "multer";
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
  getWorkOrdererForOverview,
  getTenderProcess,
  saveTenderProcessStep,
  saveTenderProcessStepaws,
  getPreliminarySiteWork,
  savePreliminarySiteWork,
  savePreliminarySiteWorkaws,
  getFinancialGenerals,
  updateFinancialGenerals,
  getTenderPenalityValue
} from "./tender.controller.js";

const upload = multer({ storage: multer.memoryStorage() });

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

tenderrouter.get("/process/:tender_id", getTenderProcess);
tenderrouter.post("/process/step", saveTenderProcessStep);
tenderrouter.post("/processaws/step", upload.single("file"), saveTenderProcessStepaws);
tenderrouter.get("/preliminary/:tender_id", getPreliminarySiteWork);
tenderrouter.post("/preliminary/step", savePreliminarySiteWork);
tenderrouter.post("/preliminaryaws/step", upload.single("file"), savePreliminarySiteWorkaws);

tenderrouter.get("/getfinancialgenerals/:tender_id/:workOrder_id", getFinancialGenerals);
tenderrouter.put("/updatefinancialgenerals/:tender_id/:workOrder_id", updateFinancialGenerals);

tenderrouter.get("/tenderpenalty", getTenderPenalityValue);



// Special endpoint for tender_status_check
tenderrouter.put("/statuscheck/:tender_id", updateTenderStatusCheck);

export default tenderrouter;
