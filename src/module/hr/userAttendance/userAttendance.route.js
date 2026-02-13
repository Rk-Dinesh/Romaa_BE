import { Router } from "express";
import { performPunch, uploadDocument } from "./userAttendance.controller.js";
import multer from "multer";
// Optional: Import your Auth Middleware here
// import { verifyJWT } from "../../middleware/auth.middleware.js";
const upload = multer({ storage: multer.memoryStorage() });

const AttendanceRoute = Router();


AttendanceRoute.post("/photourl", upload.single("file"), uploadDocument);
AttendanceRoute.post("/punch", performPunch);



export default AttendanceRoute;