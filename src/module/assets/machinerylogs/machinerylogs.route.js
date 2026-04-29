import express from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { createBulkLogs, getAllLogs, getProjectLogs } from "./machinerylogs.controller.js";

const machinerylogrouter = express.Router();
machinerylogrouter.use(verifyJWT);

machinerylogrouter.post("/bulk", createBulkLogs); 
machinerylogrouter.get("/project/:projectId", getProjectLogs);
machinerylogrouter.get("/getall-logs", getAllLogs);
export default machinerylogrouter;