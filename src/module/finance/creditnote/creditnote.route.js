import { Router } from "express";
import { getNextCnNo, getList, getBySupplier, getByTender, getById, create, approve, update, deleteDraft } from "./creditnote.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const creditNoteRouter = Router();

// GET /creditnote/next-no
creditNoteRouter.get(
  "/next-no",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getNextCnNo
);

// GET /creditnote/list
creditNoteRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getList
);

// GET /creditnote/by-supplier/:supplierId
creditNoteRouter.get(
  "/by-supplier/:supplierId",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getBySupplier
);

// GET /creditnote/by-tender/:tenderId
creditNoteRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getByTender
);

// POST /creditnote/create
creditNoteRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "create"),
  create
);

// PATCH /creditnote/approve/:id
creditNoteRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "edit"),
  approve
);

// PATCH /creditnote/update/:id
creditNoteRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "edit"),
  update
);

// DELETE /creditnote/delete/:id
creditNoteRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "delete"),
  deleteDraft
);

// GET /creditnote/:id
creditNoteRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getById
);

export default creditNoteRouter;
