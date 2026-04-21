import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  generate,
  cancel,
  list,
  getById,
  getByIrn,
  getQr,
} from "./einvoice.controller.js";

const router = Router();

// ── IRN generation / cancellation ───────────────────────────────────────────
router.post("/generate",      verifyJWT, generate);

// ── Listing & lookups ──────────────────────────────────────────────────────
router.get ("/list",          verifyJWT, list);
router.get ("/by-irn/:irn",   verifyJWT, getByIrn);
router.get ("/:id/qr",        verifyJWT, getQr);
router.post("/:id/cancel",    verifyJWT, cancel);
router.get ("/:id",           verifyJWT, getById);

export default router;
