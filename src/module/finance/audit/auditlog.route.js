import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { getAuditTrail, getEntityAuditTrail } from "./auditlog.controller.js";

const auditLogRouter = Router();
auditLogRouter.get("/", verifyJWT, verifyPermission("finance", "audit_trail", "read"), getAuditTrail);
auditLogRouter.get("/:entity_type/:entity_id", verifyJWT, verifyPermission("finance", "audit_trail", "read"), getEntityAuditTrail);
export default auditLogRouter;
