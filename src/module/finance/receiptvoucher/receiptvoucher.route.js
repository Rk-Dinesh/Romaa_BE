import { Router } from "express";
import { getNextRvNo, getList, getBySupplier, getByTender, create, approve } from "./receiptvoucher.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const receiptVoucherRouter = Router();

// GET /receiptvoucher/next-no
receiptVoucherRouter.get(
  "/next-no",
  // verifyJWT,
  // verifyPermission("finance", "receiptvoucher", "read"),
  getNextRvNo
);

// GET /receiptvoucher/list
receiptVoucherRouter.get(
  "/list",
  // verifyJWT,
  // verifyPermission("finance", "receiptvoucher", "read"),
  getList
);

// GET /receiptvoucher/by-supplier/:supplierId
receiptVoucherRouter.get(
  "/by-supplier/:supplierId",
  // verifyJWT,
  // verifyPermission("finance", "receiptvoucher", "read"),
  getBySupplier
);

// GET /receiptvoucher/by-tender/:tenderId
receiptVoucherRouter.get(
  "/by-tender/:tenderId",
  // verifyJWT,
  // verifyPermission("finance", "receiptvoucher", "read"),
  getByTender
);

// POST /receiptvoucher/create
receiptVoucherRouter.post(
  "/create",
  // verifyJWT,
  // verifyPermission("finance", "receiptvoucher", "create"),
  create
);

// PATCH /receiptvoucher/approve/:id
receiptVoucherRouter.patch(
  "/approve/:id",
  // verifyJWT,
  // verifyPermission("finance", "receiptvoucher", "edit"),
  approve
);

export default receiptVoucherRouter;
