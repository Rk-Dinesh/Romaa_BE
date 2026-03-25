import { Router } from "express";
import { getNextPvNo, getList, getBySupplier, getByTender, getById, create, approve, update, deleteDraft } from "./paymentvoucher.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const paymentVoucherRouter = Router();

// GET /paymentvoucher/next-no
paymentVoucherRouter.get(
  "/next-no",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "read"),
  getNextPvNo
);

// GET /paymentvoucher/list
paymentVoucherRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "read"),
  getList
);

// GET /paymentvoucher/by-supplier/:supplierId
paymentVoucherRouter.get(
  "/by-supplier/:supplierId",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "read"),
  getBySupplier
);

// GET /paymentvoucher/by-tender/:tenderId
paymentVoucherRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "read"),
  getByTender
);

// POST /paymentvoucher/create
paymentVoucherRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "create"),
  create
);

// PATCH /paymentvoucher/approve/:id
paymentVoucherRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "edit"),
  approve
);

// PATCH /paymentvoucher/update/:id
paymentVoucherRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "edit"),
  update
);

// DELETE /paymentvoucher/delete/:id
paymentVoucherRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "delete"),
  deleteDraft
);

// GET /paymentvoucher/:id
paymentVoucherRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "paymentvoucher", "read"),
  getById
);

export default paymentVoucherRouter;
