import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../common/Auth.middlware.js";
import {
  upsertRule,
  listRules,
  getRule,
  deleteRule,
  simulate,
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

// ── Rule configuration (Settings UI) ──────────────────────────────────────
router.post  ("/rules",                  verifyJWT, verifyPermission("approval", "rules", "create"), upsertRule);
router.get   ("/rules",                  verifyJWT, verifyPermission("approval", "rules", "read"),   listRules);
router.get   ("/rules/:source_type",     verifyJWT, verifyPermission("approval", "rules", "read"),   getRule);
router.delete("/rules/:source_type",     verifyJWT, verifyPermission("approval", "rules", "delete"), deleteRule);

// ── Simulator — dry-run a rule without creating a request ─────────────────
router.post  ("/rules/simulate",         verifyJWT, verifyPermission("approval", "simulator", "read"), simulate);

// ── Request lifecycle ─────────────────────────────────────────────────────
router.post  ("/requests",                verifyJWT, verifyPermission("approval", "requests", "create"), initiate);
router.get   ("/requests/pending-for-me", verifyJWT, verifyPermission("approval", "my_pending", "read"), pendingForMe);
router.get   ("/requests",                verifyJWT, verifyPermission("approval", "requests", "read"),   list);
router.get   ("/requests/:id",            verifyJWT, verifyPermission("approval", "requests", "read"),   getRequest);
router.post  ("/requests/:id/approve",    verifyJWT, verifyPermission("approval", "requests", "edit"),   approve);
router.post  ("/requests/:id/reject",     verifyJWT, verifyPermission("approval", "requests", "edit"),   reject);
router.post  ("/requests/:id/comment",    verifyJWT, verifyPermission("approval", "requests", "edit"),   comment);
router.post  ("/requests/:id/withdraw",   verifyJWT, verifyPermission("approval", "requests", "edit"),   withdraw);

export default router;
