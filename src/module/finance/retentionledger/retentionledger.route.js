import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
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
router.get ("/payable/outstanding",    verifyJWT, getPayableOutstanding);
router.get ("/receivable/outstanding", verifyJWT, getReceivableOutstanding);
router.get ("/summary",                verifyJWT, getSummary);

// ── Releases ────────────────────────────────────────────────────────────────
router.post("/release",               verifyJWT, createRelease);
router.get ("/release/list",          verifyJWT, listReleases);
router.get ("/release/:id",           verifyJWT, getReleaseById);
router.post("/release/:id/approve",   verifyJWT, approveRelease);
router.post("/release/:id/cancel",    verifyJWT, cancelRelease);

// ── Releases tied to a specific bill ────────────────────────────────────────
router.get ("/bill/:id",              verifyJWT, getReleasesForBill);

export default router;
