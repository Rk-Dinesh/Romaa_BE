import { Router } from "express";
import {
  markCheckIn,
  markCheckOut,
  raiseRegularization,
  actionRegularization,
  getMyAttendance,
  getLiveTeamDashboard,
} from "./userAttendance.controller.js";

// Optional: Import your Auth Middleware here
// import { verifyJWT } from "../../middleware/auth.middleware.js";

const AttendanceRoute = Router();

AttendanceRoute.post("/checkin", markCheckIn);
AttendanceRoute.post("/checkout", markCheckOut);

// Regularization
AttendanceRoute.post("/regularize/apply", raiseRegularization); // Employee
AttendanceRoute.post("/regularize/action", actionRegularization); // Manager (Needs Auth Middleware ideally)

// Reports
AttendanceRoute.get("/history", getMyAttendance); // ?employeeId=...&month=2&year=2026

AttendanceRoute.get("/dashboard/live", getLiveTeamDashboard);


export default AttendanceRoute;