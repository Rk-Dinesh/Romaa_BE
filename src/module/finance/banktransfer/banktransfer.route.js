import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  getNextTransferNo,
  getList,
  getById,
  create,
  update,
  deleteDraft,
  approve,
} from "./banktransfer.controller.js";

const router = Router();

router.get(
  "/next-no",
  verifyJWT,
//  verifyPermission("finance", "banktransfer", "read"),
  getNextTransferNo,
);
router.get(
  "/list",
  verifyJWT,
//  verifyPermission("finance", "banktransfer", "read"),
  getList,
);
router.post(
  "/create",
  verifyJWT,
 // verifyPermission("finance", "banktransfer", "create"),
  create,
);
router.patch(
  "/update/:id",
  verifyJWT,
 // verifyPermission("finance", "banktransfer", "edit"),
  update,
);
router.delete(
  "/delete/:id",
  verifyJWT,
 // verifyPermission("finance", "banktransfer", "delete"),
  deleteDraft,
);
router.patch(
  "/approve/:id",
  verifyJWT,
 // verifyPermission("finance", "banktransfer", "edit"),
  approve,
);
router.get(
  "/:id",
  verifyJWT,
 // verifyPermission("finance", "banktransfer", "read"),
  getById,
);

export default router;
