import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  addContractWorkers,
  getContractWorkers,
  updateContractWorker,
  removeContractWorker,
  getpaginatedContractor
} from "./contractworker.controller.js";

const permittedcontractworkerrouter = Router();
permittedcontractworkerrouter.use(verifyJWT);

permittedcontractworkerrouter.post("/add", addContractWorkers);
permittedcontractworkerrouter.get("/gettender/:tender_id", getContractWorkers);
permittedcontractworkerrouter.put("/update/:tender_id/:worker_id", updateContractWorker);
permittedcontractworkerrouter.delete("/remove/:tender_id/:worker_id", removeContractWorker);
permittedcontractworkerrouter.get('/permitted-contractor/:tender_id',getpaginatedContractor)

export default permittedcontractworkerrouter;
