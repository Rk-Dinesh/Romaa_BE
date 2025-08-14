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
  getAllEmployeeNameId
} from "./contractemployee.controller.js";

const router = Router();

// CRUD
router.post("/addworker", createWorker);
router.get("/getallworkers", getAllWorkers);
router.get('/getallContractorId',getAllEmployeeNameId)
router.get("/getworker/:worker_id", getWorkerById);
router.get("/getactiveworkers", getActiveWorkers);
router.get("/searchworkers", searchWorkers);
router.put("/updateworker/:worker_id", updateWorker);
router.delete("/deleteworker/:worker_id", deleteWorker);

// Attendance
router.post("/markattendance/:worker_id", markAttendance);
router.put("/updateattendance/:worker_id", updateAttendance);
router.get("/getattendance/:worker_id", getAttendance);

export default router;


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
