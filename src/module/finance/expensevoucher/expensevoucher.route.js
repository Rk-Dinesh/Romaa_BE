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

const expenseVoucherRouter = Router();

// GET /expensevoucher/next-no
expenseVoucherRouter.get(
  "/next-no",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "read"),
  getNextEvNo,
);

// GET /expensevoucher/list
expenseVoucherRouter.get(
  "/list",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "read"),
  getList,
);

// GET /expensevoucher/by-tender/:tenderId
expenseVoucherRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "read"),
  getByTender,
);

// GET /expensevoucher/by-employee/:employeeId
expenseVoucherRouter.get(
  "/by-employee/:employeeId",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "read"),
  getByEmployee,
);

// POST /expensevoucher/create
expenseVoucherRouter.post(
  "/create",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "create"),
  create,
);

// PATCH /expensevoucher/approve/:id
expenseVoucherRouter.patch(
  "/approve/:id",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "edit"),
  approve,
);

// PATCH /expensevoucher/update/:id
expenseVoucherRouter.patch(
  "/update/:id",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "edit"),
  update,
);

// DELETE /expensevoucher/delete/:id
expenseVoucherRouter.delete(
  "/delete/:id",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "delete"),
  deleteDraft,
);

// GET /expensevoucher/:id   (keep last — catches anything not matched above)
expenseVoucherRouter.get(
  "/:id",
  verifyJWT,
 // verifyPermission("finance", "expensevoucher", "read"),
  getById,
);

export default expenseVoucherRouter;
