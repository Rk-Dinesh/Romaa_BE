import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { createBulkLogs, getAllLogs, getProjectLogs } from "./machinerylogs.controller.js";

const machinerylogrouter = express.Router();
machinerylogrouter.use(verifyJWT);

machinerylogrouter.post("/bulk",                  verifyPermission("asset", "machinery_logs", "create"), createBulkLogs);
machinerylogrouter.get("/project/:projectId",     verifyPermission("asset", "machinery_logs", "read"),   getProjectLogs);
machinerylogrouter.get("/getall-logs",            verifyPermission("asset", "machinery_logs", "read"),   getAllLogs);

export default machinerylogrouter;
