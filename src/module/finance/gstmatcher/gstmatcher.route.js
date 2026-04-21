import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  upload,
  list,
  getById,
  runMatch,
  manualLink,
  manualUnlink,
  deleteUpload,
} from "./gstmatcher.controller.js";

const router = Router();

// ── Uploads ─────────────────────────────────────────────────────────────────
router.post  ("/upload",        verifyJWT, verifyPermission("finance", "gst_matcher", "create"), upload);
router.get   ("/list",          verifyJWT, verifyPermission("finance", "gst_matcher", "read"),   list);
router.get   ("/:id",           verifyJWT, verifyPermission("finance", "gst_matcher", "read"),   getById);
router.delete("/:id",           verifyJWT, verifyPermission("finance", "gst_matcher", "delete"), deleteUpload);

// ── Match runner ────────────────────────────────────────────────────────────
router.post  ("/match",         verifyJWT, verifyPermission("finance", "gst_matcher", "edit"),   runMatch);

// ── Manual link/unlink ──────────────────────────────────────────────────────
router.post  ("/:id/link",      verifyJWT, verifyPermission("finance", "gst_matcher", "edit"),   manualLink);
router.post  ("/:id/unlink",    verifyJWT, verifyPermission("finance", "gst_matcher", "edit"),   manualUnlink);

export default router;
