import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { entities, trialBalance, pnl, balanceSheet, interEntity } from "./consolidation.controller.js";

const router = Router();

router.get("/entities",      verifyJWT, verifyPermission("finance", "consolidation", "read"), entities);
router.get("/trial-balance", verifyJWT, verifyPermission("finance", "consolidation", "read"), trialBalance);
router.get("/pnl",           verifyJWT, verifyPermission("finance", "consolidation", "read"), pnl);
router.get("/balance-sheet", verifyJWT, verifyPermission("finance", "consolidation", "read"), balanceSheet);
router.get("/inter-entity",  verifyJWT, verifyPermission("finance", "consolidation", "read"), interEntity);

export default router;
