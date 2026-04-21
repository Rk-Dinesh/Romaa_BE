import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  getNextStatementNo,
  getList,
  getUnreconciled,
  getSummary,
  getById,
  create,
  appendLines,
  autoMatch,
  manualMatch,
  unmatch,
  ignoreLine,
  closeStatement,
  remove,
} from "./bankreconciliation.controller.js";

const router = Router();

router.get   ("/next-no",        verifyJWT, verifyPermission("finance", "bank_reconciliation", "read"),   getNextStatementNo);
router.get   ("/list",           verifyJWT, verifyPermission("finance", "bank_reconciliation", "read"),   getList);
router.get   ("/unreconciled",   verifyJWT, verifyPermission("finance", "bank_reconciliation", "read"),   getUnreconciled);
router.get   ("/summary",        verifyJWT, verifyPermission("finance", "bank_reconciliation", "read"),   getSummary);

router.post  ("/create",         verifyJWT, verifyPermission("finance", "bank_reconciliation", "create"), create);
router.post  ("/:id/lines",      verifyJWT, verifyPermission("finance", "bank_reconciliation", "edit"),   appendLines);
router.post  ("/:id/auto-match", verifyJWT, verifyPermission("finance", "bank_reconciliation", "edit"),   autoMatch);

router.patch ("/:id/lines/:lineId/match",   verifyJWT, verifyPermission("finance", "bank_reconciliation", "edit"),   manualMatch);
router.patch ("/:id/lines/:lineId/unmatch", verifyJWT, verifyPermission("finance", "bank_reconciliation", "edit"),   unmatch);
router.patch ("/:id/lines/:lineId/ignore",  verifyJWT, verifyPermission("finance", "bank_reconciliation", "edit"),   ignoreLine);
router.patch ("/:id/close",                 verifyJWT, verifyPermission("finance", "bank_reconciliation", "edit"),   closeStatement);

router.delete("/:id",            verifyJWT, verifyPermission("finance", "bank_reconciliation", "delete"), remove);
router.get   ("/:id",            verifyJWT, verifyPermission("finance", "bank_reconciliation", "read"),   getById);

export default router;
