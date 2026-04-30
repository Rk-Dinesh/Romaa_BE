import { Router } from "express";
import {
  upsertPolicy,
  listPolicies,
  getPolicy,
  deletePolicy,
  previewForEmployee,
} from "./leavePolicy.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const LeavePolicyRoute = Router();

// HR reads
LeavePolicyRoute.get("/list",     verifyJWT, verifyPermission("hr", "leave", "read"), listPolicies);
// Preview is allowed for any authenticated employee (so the leave form can hydrate)
LeavePolicyRoute.get("/preview",  verifyJWT, previewForEmployee);
LeavePolicyRoute.get("/:id",      verifyJWT, verifyPermission("hr", "leave", "read"), getPolicy);

// HR writes
LeavePolicyRoute.post("/upsert",  verifyJWT, verifyPermission("hr", "leave", "edit"),   upsertPolicy);
LeavePolicyRoute.delete("/:id",   verifyJWT, verifyPermission("hr", "leave", "delete"), deletePolicy);

export default LeavePolicyRoute;
