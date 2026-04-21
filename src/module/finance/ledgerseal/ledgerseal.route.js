import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { sealApproved, verify, status, list } from "./ledgerseal.controller.js";

const router = Router();

router.post("/seal-approved", verifyJWT, verifyPermission("finance", "ledger_seal", "create"), sealApproved);
router.get ("/verify",        verifyJWT, verifyPermission("finance", "ledger_seal", "read"),   verify);
router.get ("/status",        verifyJWT, verifyPermission("finance", "ledger_seal", "read"),   status);
router.get ("/list",          verifyJWT, verifyPermission("finance", "ledger_seal", "read"),   list);

export default router;
