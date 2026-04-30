import { Router } from "express";
import multer from "multer";
import {
  applyLeave,
  actionLeave,
  getMyLeaves,
  cancelLeave,
  getTeamLeaves,
  getAllPendingLeaves,
  getBalanceHistory,
  getYearlySummary,
  getLeaveHistory,
  uploadLeaveAttachment,
  grantEventLeave,
  withdrawLeave,
  bulkActionLeave,
  getMyPendingApprovals,
} from "./leaverequest.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const LeaveRoute = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Employee actions
LeaveRoute.post("/apply",       verifyJWT, applyLeave);
LeaveRoute.get("/my-history",   verifyJWT, getMyLeaves);
LeaveRoute.post("/cancel",      verifyJWT, cancelLeave);
LeaveRoute.post("/withdraw",    verifyJWT, withdrawLeave); // A2 — pre-approval-only

// Manager actions
LeaveRoute.get("/team-pending", verifyJWT, getTeamLeaves);
LeaveRoute.post("/action",      verifyJWT, actionLeave); // role:"Manager" → Manager Approved
LeaveRoute.post("/action-bulk", verifyJWT, bulkActionLeave);          // A6
LeaveRoute.get("/my-pending-approvals", verifyJWT, getMyPendingApprovals); // A7

// HR actions
LeaveRoute.get("/all-pending",       verifyJWT, verifyPermission("hr", "leave", "read"), getAllPendingLeaves);

// Approved/Rejected/Cancelled history (manager: scope=team, HR: scope=all)
LeaveRoute.get("/history",           verifyJWT, getLeaveHistory);

// Leave attachment upload (medical certificate, etc.)
LeaveRoute.post("/attachment",       verifyJWT, upload.single("file"), uploadLeaveAttachment);

// HR — life-event grant (Maternity/Paternity/Bereavement etc.)
LeaveRoute.post("/grant",            verifyJWT, verifyPermission("hr", "leave", "create"), grantEventLeave);

// Balance history (employee views own; HR can pass ?employeeId=)
LeaveRoute.get("/balance-history",   verifyJWT, getBalanceHistory);
LeaveRoute.get("/yearly-summary",    verifyJWT, getYearlySummary);
// HR second-level approval reuses the same /action endpoint with role:"HR" in body

export default LeaveRoute;
