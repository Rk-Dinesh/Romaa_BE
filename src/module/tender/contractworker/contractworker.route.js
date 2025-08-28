import { Router } from "express";
import {
  addContractWorkers,
  getContractWorkers,
  updateContractWorker,
  removeContractWorker,
  getpaginatedContractor
} from "./contractworker.controller.js";

const permittedcontractworkerrouter = Router();

permittedcontractworkerrouter.post("/add", addContractWorkers);
permittedcontractworkerrouter.get("/gettender/:tender_id", getContractWorkers);
permittedcontractworkerrouter.put("/update/:tender_id/:worker_id", updateContractWorker);
permittedcontractworkerrouter.delete("/remove/:tender_id/:worker_id", removeContractWorker);
permittedcontractworkerrouter.get('/permitted-contractor/:tender_id',getpaginatedContractor)

export default permittedcontractworkerrouter;
