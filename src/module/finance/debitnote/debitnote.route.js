import { Router } from "express";
import { getNextDnNo, getList, getBySupplier, getByTender, getById, create, approve, update, deleteDraft } from "./debitnote.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { validate } from "../../../common/validate.js";
import { CreateDebitNoteSchema, UpdateDebitNoteSchema } from "../finance.schemas.js";

const debitNoteRouter = Router();

// GET /debitnote/next-no
debitNoteRouter.get(
  "/next-no",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getNextDnNo
);

// GET /debitnote/list
debitNoteRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getList
);

// GET /debitnote/by-supplier/:supplierId
debitNoteRouter.get(
  "/by-supplier/:supplierId",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getBySupplier
);

// GET /debitnote/by-tender/:tenderId
debitNoteRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getByTender
);

// POST /debitnote/create
debitNoteRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "create"),
  validate(CreateDebitNoteSchema),
  create
);

// PATCH /debitnote/approve/:id
debitNoteRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "edit"),
  approve
);

// PATCH /debitnote/update/:id
debitNoteRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "edit"),
  validate(UpdateDebitNoteSchema),
  update
);

// DELETE /debitnote/delete/:id
debitNoteRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "delete"),
  deleteDraft
);

// GET /debitnote/:id
debitNoteRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "debit_credit_note", "read"),
  getById
);

export default debitNoteRouter;
