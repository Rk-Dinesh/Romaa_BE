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
  verifyPermission("finance", "internal_transfer", "read"),
  getNextTransferNo,
);
router.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "internal_transfer", "read"),
  getList,
);
router.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "internal_transfer", "create"),
  create,
);
router.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "internal_transfer", "edit"),
  update,
);
router.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "internal_transfer", "delete"),
  deleteDraft,
);
router.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "internal_transfer", "edit"),
  approve,
);
router.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "internal_transfer", "read"),
  getById,
);

export default router;
