import { Router } from "express";
import { 
  applyLeave, 
  actionLeave, 
  getMyLeaves, 
  cancelLeave,
  getTeamLeaves 
} from "./leaverequest.controller.js";

const LeaveRoute = Router();

// Employee Actions
LeaveRoute.post("/apply", applyLeave);
LeaveRoute.get("/my-history", getMyLeaves); // ?employeeId=...

// Manager Actions
LeaveRoute.get("/team-pending", getTeamLeaves); // ?managerId=...
LeaveRoute.post("/action", actionLeave); // Approve/Reject
LeaveRoute.post("/cancel", cancelLeave); // Cancel Leave

export default LeaveRoute;