import { Router } from "express";
import { getNextPvNo, getList, getListCash, getListBank, getBySupplier, getByTender, getById, create, approve, update, deleteDraft } from "./paymentvoucher.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const paymentVoucherRouter = Router();

// GET /paymentvoucher/next-no
paymentVoucherRouter.get(
  "/next-no",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getNextPvNo
);

// GET /paymentvoucher/list
paymentVoucherRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getList
);

// GET /paymentvoucher/list/cash  ← cash-mode vouchers only
paymentVoucherRouter.get(
  "/list/cash",
  verifyJWT,
  getListCash
);

// GET /paymentvoucher/list/bank  ← bank-mode vouchers (Cheque/NEFT/RTGS/UPI/DD)
paymentVoucherRouter.get(
  "/list/bank",
  verifyJWT,
  getListBank
);

// GET /paymentvoucher/by-supplier/:supplierId
paymentVoucherRouter.get(
  "/by-supplier/:supplierId",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getBySupplier
);

// GET /paymentvoucher/by-tender/:tenderId
paymentVoucherRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getByTender
);

// POST /paymentvoucher/create
paymentVoucherRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "create"),
  create
);

// PATCH /paymentvoucher/approve/:id
paymentVoucherRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "edit"),
  approve
);

// PATCH /paymentvoucher/update/:id
paymentVoucherRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "edit"),
  update
);

// DELETE /paymentvoucher/delete/:id
paymentVoucherRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "delete"),
  deleteDraft
);

// GET /paymentvoucher/:id
paymentVoucherRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "bank_transaction", "read"),
  getById
);

export default paymentVoucherRouter;
