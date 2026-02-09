import { Router } from "express";
import { performPunch } from "./userAttendance.controller.js";

// Optional: Import your Auth Middleware here
// import { verifyJWT } from "../../middleware/auth.middleware.js";

const AttendanceRoute = Router();

AttendanceRoute.post("/punch", performPunch);



export default AttendanceRoute;