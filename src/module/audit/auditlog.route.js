import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../common/Auth.middlware.js";
import {
  getAuditTrail,
  getEntityAuditTrail,
  getMyAuditTrail,
  getAuditCounts,
  runRetentionNow,
} from "./auditlog.controller.js";

const router = Router();

// Personal trail — any authenticated user can see their own actions.
router.get("/me",                         verifyJWT, getMyAuditTrail);

// Admin reads — gated by the audit permission.
router.get("/counts",                     verifyJWT, verifyPermission("audit", "trail", "read"), getAuditCounts);
router.post("/retention/run",             verifyJWT, verifyPermission("audit", "trail", "edit"), runRetentionNow);
router.get("/",                           verifyJWT, verifyPermission("audit", "trail", "read"), getAuditTrail);
router.get("/:entity_type/:entity_id",    verifyJWT, verifyPermission("audit", "trail", "read"), getEntityAuditTrail);

export default router;
