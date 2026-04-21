import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
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

router.post("/rules",                       verifyJWT, verifyPermission("finance", "approval", "create"), upsertRule);
router.get ("/rules",                       verifyJWT, verifyPermission("finance", "approval", "read"),   listRules);
router.get ("/rules/:source_type",          verifyJWT, verifyPermission("finance", "approval", "read"),   getRule);

router.post("/requests",                    verifyJWT, verifyPermission("finance", "approval", "create"), initiate);
router.get ("/requests/pending-for-me",     verifyJWT, verifyPermission("finance", "approval", "read"),   pendingForMe);
router.get ("/requests",                    verifyJWT, verifyPermission("finance", "approval", "read"),   list);
router.get ("/requests/:id",                verifyJWT, verifyPermission("finance", "approval", "read"),   getRequest);
router.post("/requests/:id/approve",        verifyJWT, verifyPermission("finance", "approval", "edit"),   approve);
router.post("/requests/:id/reject",         verifyJWT, verifyPermission("finance", "approval", "edit"),   reject);
router.post("/requests/:id/comment",        verifyJWT, verifyPermission("finance", "approval", "edit"),   comment);
router.post("/requests/:id/withdraw",       verifyJWT, verifyPermission("finance", "approval", "edit"),   withdraw);

export default router;
