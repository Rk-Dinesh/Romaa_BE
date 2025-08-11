import { Router } from "express";
import {
  addContractWorkers,
  getContractWorkers,
  updateContractWorker,
  removeContractWorker
} from "./contractworker.controller.js";

const contractworkerrouter = Router();

contractworkerrouter.post("/add", addContractWorkers);
contractworkerrouter.get("/gettender/:tender_id", getContractWorkers);
contractworkerrouter.put("/update/:tender_id/:worker_id", updateContractWorker);
contractworkerrouter.delete("/remove/:tender_id/:worker_id", removeContractWorker);

export default contractworkerrouter;
