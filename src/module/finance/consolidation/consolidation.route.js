import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { entities, trialBalance, pnl, balanceSheet, interEntity } from "./consolidation.controller.js";

const router = Router();

router.get("/entities",      verifyJWT, entities);
router.get("/trial-balance", verifyJWT, trialBalance);
router.get("/pnl",           verifyJWT, pnl);
router.get("/balance-sheet", verifyJWT, balanceSheet);
router.get("/inter-entity",  verifyJWT, interEntity);

export default router;
