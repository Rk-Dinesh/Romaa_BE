import { Router } from "express";
import multer from "multer";
import { verifyJWT } from "../../../common/Auth.middlware.js";
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
router.post("/upload",       verifyJWT, uploader.array("files"), upload);
router.post("/upload-one",   verifyJWT, uploader.single("file"),  upload);

// ── Listing ─────────────────────────────────────────────────────────────────
router.get ("/for-source",   verifyJWT, listForSource);     // ?source_type=PurchaseBill&source_ref=...
router.get ("/list",         verifyJWT, list);              // paginated, filterable
router.get ("/stats",        verifyJWT, stats);

// ── Single attachment ──────────────────────────────────────────────────────
router.get   ("/:id/download", verifyJWT, getDownloadUrl);  // returns presigned URL
router.patch ("/:id",          verifyJWT, updateMeta);
router.post  ("/:id/restore",  verifyJWT, restore);
router.delete("/:id",          verifyJWT, deleteOne);       // ?hard_delete=true for permanent
router.get   ("/:id",          verifyJWT, getById);

export default router;
