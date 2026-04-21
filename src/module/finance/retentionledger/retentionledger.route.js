import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  getPayableOutstanding,
  getReceivableOutstanding,
  getSummary,
  createRelease,
  approveRelease,
  cancelRelease,
  listReleases,
  getReleaseById,
  getReleasesForBill,
} from "./retentionledger.controller.js";

const router = Router();

// ── Outstanding / summary ───────────────────────────────────────────────────
router.get ("/payable/outstanding",    verifyJWT, verifyPermission("finance", "retention", "read"),   getPayableOutstanding);
router.get ("/receivable/outstanding", verifyJWT, verifyPermission("finance", "retention", "read"),   getReceivableOutstanding);
router.get ("/summary",                verifyJWT, verifyPermission("finance", "retention", "read"),   getSummary);

// ── Releases ────────────────────────────────────────────────────────────────
router.post("/release",               verifyJWT, verifyPermission("finance", "retention", "create"), createRelease);
router.get ("/release/list",          verifyJWT, verifyPermission("finance", "retention", "read"),   listReleases);
router.get ("/release/:id",           verifyJWT, verifyPermission("finance", "retention", "read"),   getReleaseById);
router.post("/release/:id/approve",   verifyJWT, verifyPermission("finance", "retention", "edit"),   approveRelease);
router.post("/release/:id/cancel",    verifyJWT, verifyPermission("finance", "retention", "edit"),   cancelRelease);

// ── Releases tied to a specific bill ────────────────────────────────────────
router.get ("/bill/:id",              verifyJWT, verifyPermission("finance", "retention", "read"),   getReleasesForBill);

export default router;
