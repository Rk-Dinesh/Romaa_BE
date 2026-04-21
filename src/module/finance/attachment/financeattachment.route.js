import { Router } from "express";
import multer from "multer";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  upload,
  listForSource,
  list,
  getById,
  getDownloadUrl,
  updateMeta,
  deleteOne,
  restore,
  stats,
} from "./financeattachment.controller.js";

// Multer in-memory storage — files are streamed to S3 in the service.
// 25 MB per file matches the service-side MAX_FILE_BYTES guard.
const uploader = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },
});

const router = Router();

// ── Upload (single or multiple) ─────────────────────────────────────────────
// Form fields:
//   files (multiple) or file (single)
//   source_type, source_ref, source_no, tender_id, category, description, tags
router.post("/upload",       verifyJWT, verifyPermission("finance", "finance_attachment", "create"), uploader.array("files"), upload);
router.post("/upload-one",   verifyJWT, verifyPermission("finance", "finance_attachment", "create"), uploader.single("file"),  upload);

// ── Listing ─────────────────────────────────────────────────────────────────
router.get ("/for-source",   verifyJWT, verifyPermission("finance", "finance_attachment", "read"),   listForSource);     // ?source_type=PurchaseBill&source_ref=...
router.get ("/list",         verifyJWT, verifyPermission("finance", "finance_attachment", "read"),   list);              // paginated, filterable
router.get ("/stats",        verifyJWT, verifyPermission("finance", "finance_attachment", "read"),   stats);

// ── Single attachment ──────────────────────────────────────────────────────
router.get   ("/:id/download", verifyJWT, verifyPermission("finance", "finance_attachment", "read"),   getDownloadUrl);  // returns presigned URL
router.patch ("/:id",          verifyJWT, verifyPermission("finance", "finance_attachment", "edit"),   updateMeta);
router.post  ("/:id/restore",  verifyJWT, verifyPermission("finance", "finance_attachment", "edit"),   restore);
router.delete("/:id",          verifyJWT, verifyPermission("finance", "finance_attachment", "delete"), deleteOne);       // ?hard_delete=true for permanent
router.get   ("/:id",          verifyJWT, verifyPermission("finance", "finance_attachment", "read"),   getById);

export default router;
