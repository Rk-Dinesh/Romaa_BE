import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { sealApproved, verify, status, list } from "./ledgerseal.controller.js";

const router = Router();

router.post("/seal-approved", verifyJWT, sealApproved);
router.get ("/verify",        verifyJWT, verify);
router.get ("/status",        verifyJWT, status);
router.get ("/list",          verifyJWT, list);

export default router;
