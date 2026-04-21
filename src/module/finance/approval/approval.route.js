import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  upsertRule,
  listRules,
  getRule,
  initiate,
  approve,
  reject,
  comment,
  withdraw,
  pendingForMe,
  list,
  getRequest,
} from "./approval.controller.js";

const router = Router();

router.post("/rules",                       verifyJWT, upsertRule);
router.get ("/rules",                       verifyJWT, listRules);
router.get ("/rules/:source_type",          verifyJWT, getRule);

router.post("/requests",                    verifyJWT, initiate);
router.get ("/requests/pending-for-me",     verifyJWT, pendingForMe);
router.get ("/requests",                    verifyJWT, list);
router.get ("/requests/:id",                verifyJWT, getRequest);
router.post("/requests/:id/approve",        verifyJWT, approve);
router.post("/requests/:id/reject",         verifyJWT, reject);
router.post("/requests/:id/comment",        verifyJWT, comment);
router.post("/requests/:id/withdraw",       verifyJWT, withdraw);

export default router;
