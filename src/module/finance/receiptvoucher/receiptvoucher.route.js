import { Router } from "express";
import { getNextRvNo, getList, getListCash, getListBank, getBySupplier, getByTender, getById, create, approve, update, deleteDraft } from "./receiptvoucher.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const receiptVoucherRouter = Router();

// GET /receiptvoucher/next-no
receiptVoucherRouter.get(
  "/next-no",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getNextRvNo
);

// GET /receiptvoucher/list
receiptVoucherRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getList
);

// GET /receiptvoucher/list/cash  ← cash-mode vouchers only
receiptVoucherRouter.get(
  "/list/cash",
  verifyJWT,
  getListCash
);

// GET /receiptvoucher/list/bank  ← bank-mode vouchers (Cheque/NEFT/RTGS/UPI/DD)
receiptVoucherRouter.get(
  "/list/bank",
  verifyJWT,
  getListBank
);

// GET /receiptvoucher/by-supplier/:supplierId
receiptVoucherRouter.get(
  "/by-supplier/:supplierId",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getBySupplier
);

// GET /receiptvoucher/by-tender/:tenderId
receiptVoucherRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getByTender
);

// POST /receiptvoucher/create
receiptVoucherRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "create"),
  create
);

// PATCH /receiptvoucher/approve/:id
receiptVoucherRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "edit"),
  approve
);

// PATCH /receiptvoucher/update/:id
receiptVoucherRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "edit"),
  update
);

// DELETE /receiptvoucher/delete/:id
receiptVoucherRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "delete"),
  deleteDraft
);

// GET /receiptvoucher/:id
receiptVoucherRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getById
);

export default receiptVoucherRouter;
