import { Router } from "express";
import {
  getNextEvNo,
  getList,
  getByTender,
  getByEmployee,
  getById,
  create,
  update,
  deleteDraft,
  approve,
} from "./expensevoucher.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { validate } from "../../../common/validate.js";
import { CreateExpenseVoucherSchema, UpdateExpenseVoucherSchema } from "../finance.schemas.js";

const expenseVoucherRouter = Router();

// GET /expensevoucher/next-no
expenseVoucherRouter.get(
  "/next-no",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "read"),
  getNextEvNo,
);

// GET /expensevoucher/list
expenseVoucherRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "read"),
  getList,
);

// GET /expensevoucher/by-tender/:tenderId
expenseVoucherRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "read"),
  getByTender,
);

// GET /expensevoucher/by-employee/:employeeId
expenseVoucherRouter.get(
  "/by-employee/:employeeId",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "read"),
  getByEmployee,
);

// POST /expensevoucher/create
expenseVoucherRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "create"),
  validate(CreateExpenseVoucherSchema),
  create,
);

// PATCH /expensevoucher/approve/:id
expenseVoucherRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "edit"),
  approve,
);

// PATCH /expensevoucher/update/:id
expenseVoucherRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "edit"),
  validate(UpdateExpenseVoucherSchema),
  update,
);

// DELETE /expensevoucher/delete/:id
expenseVoucherRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "delete"),
  deleteDraft,
);

// GET /expensevoucher/:id   (keep last — catches anything not matched above)
expenseVoucherRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "expense_voucher", "read"),
  getById,
);

export default expenseVoucherRouter;
