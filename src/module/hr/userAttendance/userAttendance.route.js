import { Router } from "express";
import { performPunch, uploadDocument, applyRegularization, actionRegularization, getMyAttendanceStats, getDailyReport, getMonthlyReport } from "./userAttendance.controller.js";
import multer from "multer";
import { verifyJWT } from "../../../common/Auth.middlware.js";
// Optional: Import your Auth Middleware here

const upload = multer({ storage: multer.memoryStorage() });

const AttendanceRoute = Router();


AttendanceRoute.post("/photourl", upload.single("file"), uploadDocument);
AttendanceRoute.post("/punch", performPunch);
AttendanceRoute.post("/apply-regularization", applyRegularization);
AttendanceRoute.post("/action-regularization", actionRegularization);
AttendanceRoute.get("/get-my-attendance-stats",verifyJWT, getMyAttendanceStats);
AttendanceRoute.get("/get-daily-report", getDailyReport);
AttendanceRoute.get("/get-monthly-report", getMonthlyReport);




export default AttendanceRoute;