import { Router } from "express";
import {
  upsertPolicy,
  listPolicies,
  getPolicy,
  deletePolicy,
  previewPolicy,
} from "./weeklyOffPolicy.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const WeeklyOffPolicyRoute = Router();

// HR reads & writes
WeeklyOffPolicyRoute.get("/list",                 verifyJWT, verifyPermission("hr", "attendance", "read"),   listPolicies);
WeeklyOffPolicyRoute.get("/preview",              verifyJWT, verifyPermission("hr", "attendance", "read"),   previewPolicy);
WeeklyOffPolicyRoute.get("/:department",          verifyJWT, verifyPermission("hr", "attendance", "read"),   getPolicy);

// Upsert is one endpoint — frontend posts { department, weeklyOffs[], isActive?, notes? }.
WeeklyOffPolicyRoute.post("/upsert",              verifyJWT, verifyPermission("hr", "attendance", "edit"),   upsertPolicy);
WeeklyOffPolicyRoute.delete("/:department",       verifyJWT, verifyPermission("hr", "attendance", "delete"), deletePolicy);

export default WeeklyOffPolicyRoute;
