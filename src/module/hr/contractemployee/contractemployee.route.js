import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  createWorker,
  getAllWorkers,
  getWorkerById,
  getActiveWorkers,
  searchWorkers,
  updateWorker,
  deleteWorker,
  getAllEmployeeNameId,
  getContractWorkersPaginated,
  getWorkersByContractor,
  transferWorker,
  assignSite,
} from "./contractemployee.controller.js";

const contractworkerrouter = Router();
contractworkerrouter.use(verifyJWT);

// CRUD
contractworkerrouter.post("/addworker", createWorker);
contractworkerrouter.get("/getallworkers", getAllWorkers);
contractworkerrouter.get("/getallContractorId", getAllEmployeeNameId);
contractworkerrouter.get("/getactiveworkers", getActiveWorkers);
contractworkerrouter.get("/searchworkers", searchWorkers);
contractworkerrouter.get("/getcontractworker", getContractWorkersPaginated);
contractworkerrouter.get("/getworker/:worker_id", getWorkerById);

// NEW: Workers by contractor
contractworkerrouter.get("/bycontractor/:contractor_id", getWorkersByContractor);

// NEW: Transfer worker
contractworkerrouter.post("/transfer/:worker_id", transferWorker);

// NEW: Assign site
contractworkerrouter.put("/assign-site/:worker_id", assignSite);

// Update & Delete
contractworkerrouter.put("/updateworker/:worker_id", updateWorker);
contractworkerrouter.delete("/deleteworker/:worker_id", deleteWorker);

export default contractworkerrouter;
