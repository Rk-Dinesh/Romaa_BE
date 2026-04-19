import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
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

router.get   ("/next-no",        verifyJWT, getNextStatementNo);
router.get   ("/list",           verifyJWT, getList);
router.get   ("/unreconciled",   verifyJWT, getUnreconciled);
router.get   ("/summary",        verifyJWT, getSummary);

router.post  ("/create",         verifyJWT, create);
router.post  ("/:id/lines",      verifyJWT, appendLines);
router.post  ("/:id/auto-match", verifyJWT, autoMatch);

router.patch ("/:id/lines/:lineId/match",   verifyJWT, manualMatch);
router.patch ("/:id/lines/:lineId/unmatch", verifyJWT, unmatch);
router.patch ("/:id/lines/:lineId/ignore",  verifyJWT, ignoreLine);
router.patch ("/:id/close",                 verifyJWT, closeStatement);

router.delete("/:id",            verifyJWT, remove);
router.get   ("/:id",            verifyJWT, getById);

export default router;
