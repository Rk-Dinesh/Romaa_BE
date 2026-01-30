import express from "express";
import { createBulkLogs, getAllLogs, getProjectLogs } from "./machinerylogs.controller.js";

// import { verifyToken } from "../middleware/authMiddleware.js"; // Uncomment if you have auth

const machinerylogrouter = express.Router();

machinerylogrouter.post("/bulk", createBulkLogs); 
machinerylogrouter.get("/project/:projectId", getProjectLogs);
machinerylogrouter.get("/getall-logs", getAllLogs);
export default machinerylogrouter;