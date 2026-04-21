import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
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
router.post  ("/upload",        verifyJWT, upload);
router.get   ("/list",          verifyJWT, list);
router.get   ("/:id",           verifyJWT, getById);
router.delete("/:id",           verifyJWT, deleteUpload);

// ── Match runner ────────────────────────────────────────────────────────────
router.post  ("/match",         verifyJWT, runMatch);

// ── Manual link/unlink ──────────────────────────────────────────────────────
router.post  ("/:id/link",      verifyJWT, manualLink);
router.post  ("/:id/unlink",    verifyJWT, manualUnlink);

export default router;
