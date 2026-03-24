import { Router } from "express";
import { getNextCnNo, getList, getBySupplier, getByTender, create, approve } from "./creditnote.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const creditNoteRouter = Router();

// GET /creditnote/next-no
creditNoteRouter.get(
  "/next-no",
  // verifyJWT,
  // verifyPermission("finance", "creditnote", "read"),
  getNextCnNo
);

// GET /creditnote/list
creditNoteRouter.get(
  "/list",
  // verifyJWT,
  // verifyPermission("finance", "creditnote", "read"),
  getList
);

// GET /creditnote/by-supplier/:supplierId
creditNoteRouter.get(
  "/by-supplier/:supplierId",
  // verifyJWT,
  // verifyPermission("finance", "creditnote", "read"),
  getBySupplier
);

// GET /creditnote/by-tender/:tenderId
creditNoteRouter.get(
  "/by-tender/:tenderId",
  // verifyJWT,
  // verifyPermission("finance", "creditnote", "read"),
  getByTender
);

// POST /creditnote/create
creditNoteRouter.post(
  "/create",
  // verifyJWT,
  // verifyPermission("finance", "creditnote", "create"),
  create
);

// PATCH /creditnote/approve/:id
creditNoteRouter.patch(
  "/approve/:id",
  // verifyJWT,
  // verifyPermission("finance", "creditnote", "edit"),
  approve
);

export default creditNoteRouter;
