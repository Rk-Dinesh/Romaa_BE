import { Router } from "express";
import {
  createAttendance,
  createFromDLP,
  getByProject,
  getById,
  getWorkerHistory,
  getSummary,
  updateAttendance,
  approveAttendance,
} from "./nmrAttendance.controller.js";

const nmrAttendanceRouter = Router();

// POST  /nmrattendance/api/create
nmrAttendanceRouter.post("/api/create", createAttendance);

// POST  /nmrattendance/api/create-from-dlp/:dlr_id   body: { verified_by? }
nmrAttendanceRouter.post("/api/create-from-dlp/:dlr_id", createFromDLP);

// GET   /nmrattendance/api/list/:project_id           ?from=&to=&contractor_id=
nmrAttendanceRouter.get("/api/list/:project_id", getByProject);

// GET   /nmrattendance/api/details/:id
nmrAttendanceRouter.get("/api/details/:id", getById);

// GET   /nmrattendance/api/worker/:project_id/:worker_id   ?from=&to=
nmrAttendanceRouter.get("/api/worker/:project_id/:worker_id", getWorkerHistory);

// GET   /nmrattendance/api/summary/:project_id        ?from=&to=&contractor_id=
nmrAttendanceRouter.get("/api/summary/:project_id", getSummary);

// PUT   /nmrattendance/api/update/:id
nmrAttendanceRouter.put("/api/update/:id", updateAttendance);

// PATCH /nmrattendance/api/approve/:id   body: { verified_by? }
nmrAttendanceRouter.patch("/api/approve/:id", approveAttendance);

export default nmrAttendanceRouter;
