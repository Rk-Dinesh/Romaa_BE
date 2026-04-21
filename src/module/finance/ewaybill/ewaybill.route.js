import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  generate,
  updatePartB,
  cancel,
  markExpired,
  list,
  getById,
  getByEwbNo,
} from "./ewaybill.controller.js";

const router = Router();

router.post ("/generate",          verifyJWT, generate);
router.post ("/mark-expired",      verifyJWT, markExpired);

router.get  ("/list",              verifyJWT, list);
router.get  ("/by-ewb-no/:ewb_no", verifyJWT, getByEwbNo);

router.post ("/:id/part-b",        verifyJWT, updatePartB);
router.post ("/:id/cancel",        verifyJWT, cancel);
router.get  ("/:id",               verifyJWT, getById);

export default router;
