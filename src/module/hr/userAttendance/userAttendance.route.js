import { Router } from "express";
import {
  performPunch,
  uploadDocument,
  applyRegularization,
  actionRegularization,
  getMyAttendanceStats,
  getDailyReport,
  getMonthlyReport,
  getAttendanceByDateAndEmployeeId,
  getRegularizationList,
  getTodaySummary,
  getRegularizationById,
  getLateReport,
  getAbsenteeReport,
  getOvertimeReport,
} from "./userAttendance.controller.js";
import multer from "multer";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const upload = multer({ storage: multer.memoryStorage() });

const AttendanceRoute = Router();

// Photo upload (public — called before punch to get URL)
AttendanceRoute.post("/photourl", upload.single("file"), uploadDocument);

// Employee actions — requires auth
AttendanceRoute.post("/punch",                   verifyJWT, performPunch);
AttendanceRoute.post("/apply-regularization",    verifyJWT, applyRegularization);
AttendanceRoute.get("/get-my-attendance-stats",  verifyJWT, getMyAttendanceStats);
AttendanceRoute.get("/get-attendance-by-date-and-employee-id", verifyJWT, getAttendanceByDateAndEmployeeId);

// HR/Manager actions — requires auth + hr permission
AttendanceRoute.post("/action-regularization",  verifyJWT, verifyPermission("hr", "attendance", "edit"), actionRegularization);
AttendanceRoute.get("/get-daily-report",         verifyJWT, verifyPermission("hr", "attendance", "read"), getDailyReport);
AttendanceRoute.get("/get-monthly-report",       verifyJWT, verifyPermission("hr", "attendance", "read"), getMonthlyReport);
AttendanceRoute.get("/regularization-list",      verifyJWT, verifyPermission("hr", "attendance", "read"), getRegularizationList);
AttendanceRoute.get("/regularization/:id",       verifyJWT, verifyPermission("hr", "attendance", "read"), getRegularizationById);

// HR dashboard tiles + analytical reports
AttendanceRoute.get("/today-summary",            verifyJWT, verifyPermission("hr", "attendance", "read"), getTodaySummary);
AttendanceRoute.get("/late-report",              verifyJWT, verifyPermission("hr", "attendance", "read"), getLateReport);
AttendanceRoute.get("/absentee-report",          verifyJWT, verifyPermission("hr", "attendance", "read"), getAbsenteeReport);
AttendanceRoute.get("/overtime-report",          verifyJWT, verifyPermission("hr", "attendance", "read"), getOvertimeReport);

export default AttendanceRoute;
