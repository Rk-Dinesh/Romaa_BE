import { Router } from "express";
import {
  applyLeave,
  actionLeave,
  getMyLeaves,
  cancelLeave,
  getTeamLeaves,
  getAllPendingLeaves,
} from "./leaverequest.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const LeaveRoute = Router();

// Employee actions
LeaveRoute.post("/apply",       verifyJWT, applyLeave);
LeaveRoute.get("/my-history",   verifyJWT, getMyLeaves);
LeaveRoute.post("/cancel",      verifyJWT, cancelLeave);

// Manager actions
LeaveRoute.get("/team-pending", verifyJWT, getTeamLeaves);
LeaveRoute.post("/action",      verifyJWT, actionLeave); // role:"Manager" → Manager Approved

// HR actions
LeaveRoute.get("/all-pending",  verifyJWT, verifyPermission("hr", "leave", "read"),   getAllPendingLeaves);
// HR second-level approval reuses the same /action endpoint with role:"HR" in body

export default LeaveRoute;
