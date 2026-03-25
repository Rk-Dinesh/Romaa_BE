import { Router } from "express";
import { getNextCnNo, getList, getBySupplier, getByTender, getById, create, approve, update, deleteDraft } from "./creditnote.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const creditNoteRouter = Router();

// GET /creditnote/next-no
creditNoteRouter.get(
  "/next-no",
  verifyJWT,
  verifyPermission("finance", "creditnote", "read"),
  getNextCnNo
);

// GET /creditnote/list
creditNoteRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "creditnote", "read"),
  getList
);

// GET /creditnote/by-supplier/:supplierId
creditNoteRouter.get(
  "/by-supplier/:supplierId",
  verifyJWT,
  verifyPermission("finance", "creditnote", "read"),
  getBySupplier
);

// GET /creditnote/by-tender/:tenderId
creditNoteRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "creditnote", "read"),
  getByTender
);

// POST /creditnote/create
creditNoteRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "creditnote", "create"),
  create
);

// PATCH /creditnote/approve/:id
creditNoteRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "creditnote", "edit"),
  approve
);

// PATCH /creditnote/update/:id
creditNoteRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "creditnote", "edit"),
  update
);

// DELETE /creditnote/delete/:id
creditNoteRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "creditnote", "delete"),
  deleteDraft
);

// GET /creditnote/:id
creditNoteRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "creditnote", "read"),
  getById
);

export default creditNoteRouter;
