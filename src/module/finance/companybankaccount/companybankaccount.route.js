import { Router } from "express";
import {
  getAll,
  getById,
  getByCode,
  create,
  update,
  softDelete,
} from "./companybankaccount.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const companyBankAccountRouter = Router();

// GET /companybankaccount/list
companyBankAccountRouter.get(
  "/list",
  verifyJWT,
  // verifyPermission("finance", "companybankaccount", "read"),
  getAll
);

// GET /companybankaccount/by-code/:code
companyBankAccountRouter.get(
  "/by-code/:code",
  verifyJWT,
  // verifyPermission("finance", "companybankaccount", "read"),
  getByCode
);

// POST /companybankaccount/create
companyBankAccountRouter.post(
  "/create",
  verifyJWT,
  // verifyPermission("finance", "companybankaccount", "create"),
  create
);

// PATCH /companybankaccount/update/:id
companyBankAccountRouter.patch(
  "/update/:id",
  verifyJWT,
  // verifyPermission("finance", "companybankaccount", "edit"),
  update
);

// DELETE /companybankaccount/delete/:id
companyBankAccountRouter.delete(
  "/delete/:id",
  verifyJWT,
  // verifyPermission("finance", "companybankaccount", "delete"),
  softDelete
);

// GET /companybankaccount/:id  ← must be last
companyBankAccountRouter.get(
  "/:id",
  verifyJWT,
  // verifyPermission("finance", "companybankaccount", "read"),
  getById
);

export default companyBankAccountRouter;
