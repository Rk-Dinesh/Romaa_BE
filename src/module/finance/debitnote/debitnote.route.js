import { Router } from "express";
import { getNextDnNo, getList, getBySupplier, getByTender, getById, create, approve, update, deleteDraft } from "./debitnote.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const debitNoteRouter = Router();

// GET /debitnote/next-no
debitNoteRouter.get(
  "/next-no",
  verifyJWT,
 // verifyPermission("finance", "debitnote", "read"),
  getNextDnNo
);

// GET /debitnote/list
debitNoteRouter.get(
  "/list",
  verifyJWT,
 // verifyPermission("finance", "debitnote", "read"),
  getList
);

// GET /debitnote/by-supplier/:supplierId
debitNoteRouter.get(
  "/by-supplier/:supplierId",
  verifyJWT,
 // verifyPermission("finance", "debitnote", "read"),
  getBySupplier
);

// GET /debitnote/by-tender/:tenderId
debitNoteRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
 // verifyPermission("finance", "debitnote", "read"),
  getByTender
);

// POST /debitnote/create
debitNoteRouter.post(
  "/create",
  verifyJWT,
 // verifyPermission("finance", "debitnote", "create"),
  create
);

// PATCH /debitnote/approve/:id
debitNoteRouter.patch(
  "/approve/:id",
  verifyJWT,
//  verifyPermission("finance", "debitnote", "edit"),
  approve
);

// PATCH /debitnote/update/:id
debitNoteRouter.patch(
  "/update/:id",
  verifyJWT,
//  verifyPermission("finance", "debitnote", "edit"),
  update
);

// DELETE /debitnote/delete/:id
debitNoteRouter.delete(
  "/delete/:id",
  verifyJWT,
//  verifyPermission("finance", "debitnote", "delete"),
  deleteDraft
);

// GET /debitnote/:id
debitNoteRouter.get(
  "/:id",
  verifyJWT,
//  verifyPermission("finance", "debitnote", "read"),
  getById
);

export default debitNoteRouter;
