import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
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
router.post("/generate",      verifyJWT, verifyPermission("finance", "einvoice", "create"), generate);

// ── Listing & lookups ──────────────────────────────────────────────────────
router.get ("/list",          verifyJWT, verifyPermission("finance", "einvoice", "read"),   list);
router.get ("/by-irn/:irn",   verifyJWT, verifyPermission("finance", "einvoice", "read"),   getByIrn);
router.get ("/:id/qr",        verifyJWT, verifyPermission("finance", "einvoice", "read"),   getQr);
router.post("/:id/cancel",    verifyJWT, verifyPermission("finance", "einvoice", "edit"),   cancel);
router.get ("/:id",           verifyJWT, verifyPermission("finance", "einvoice", "read"),   getById);

export default router;
