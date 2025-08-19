import { Router } from "express";
import {
  createWorker,
  getAllWorkers,
  getWorkerById,
  getActiveWorkers,
  searchWorkers,
  updateWorker,
  deleteWorker,
  markAttendance,
  updateAttendance,
  getAttendance,
  getAllEmployeeNameId,
  getContractWorkersPaginated
} from "./contractemployee.controller.js";

const contractworkerrouter = Router();

// CRUD
contractworkerrouter.post("/addworker", createWorker);
contractworkerrouter.get("/getallworkers", getAllWorkers);
contractworkerrouter.get('/getallContractorId',getAllEmployeeNameId)
contractworkerrouter.get("/getworker/:worker_id", getWorkerById);
contractworkerrouter.get("/getactiveworkers", getActiveWorkers);
contractworkerrouter.get("/searchworkers", searchWorkers);
contractworkerrouter.put("/updateworker/:worker_id", updateWorker);
contractworkerrouter.delete("/deleteworker/:worker_id", deleteWorker);

contractworkerrouter.get("/getcontractworker",getContractWorkersPaginated );

// Attendance
contractworkerrouter.post("/markattendance/:worker_id", markAttendance);
contractworkerrouter.put("/updateattendance/:worker_id", updateAttendance);
contractworkerrouter.get("/getattendance/:worker_id", getAttendance);

export default contractworkerrouter;


// POST /addworker
// {
//   "employee_name": "John Doe",
//   "contractor_name": "ABC Contractors",
//   "site_assigned": "Site-101",
//   "department": "Civil",
//   "role": "Mason",
//   "daily_wage": 500,
//   "status": "ACTIVE",
//   "contact_phone": "9876543210"
// }
// POST /markattendance/CW001
// {
//   "date": "2025-08-04",
//   "present": true,
//   "remarks": "Full day"
// }
// GET /getattendance/CW001?startDate=2025-08-01&endDate=2025-08-31
