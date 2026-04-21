import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
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

router.post ("/generate",          verifyJWT, verifyPermission("finance", "ewaybill", "create"), generate);
router.post ("/mark-expired",      verifyJWT, verifyPermission("finance", "ewaybill", "edit"),   markExpired);

router.get  ("/list",              verifyJWT, verifyPermission("finance", "ewaybill", "read"),   list);
router.get  ("/by-ewb-no/:ewb_no", verifyJWT, verifyPermission("finance", "ewaybill", "read"),   getByEwbNo);

router.post ("/:id/part-b",        verifyJWT, verifyPermission("finance", "ewaybill", "edit"),   updatePartB);
router.post ("/:id/cancel",        verifyJWT, verifyPermission("finance", "ewaybill", "edit"),   cancel);
router.get  ("/:id",               verifyJWT, verifyPermission("finance", "ewaybill", "read"),   getById);

export default router;
