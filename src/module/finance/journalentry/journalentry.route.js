import { Router } from "express";
import {
  getNextJeNo,
  getList,
  getById,
  create,
  approve,
  reverse,
  processAutoReversals,
  update,
  deleteDraft,
} from "./journalentry.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const journalEntryRouter = Router();

// GET /journalentry/next-no
journalEntryRouter.get(
  "/next-no",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "read"),
  getNextJeNo
);

// GET /journalentry/list
journalEntryRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "read"),
  getList
);

// POST /journalentry/process-auto-reversals  — must be before /:id
journalEntryRouter.post(
  "/process-auto-reversals",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "edit"),
  processAutoReversals
);

// GET /journalentry/:id
journalEntryRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "read"),
  getById
);

// POST /journalentry/create
journalEntryRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "create"),
  create
);

// PATCH /journalentry/approve/:id
journalEntryRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "edit"),
  approve
);

// POST /journalentry/reverse/:id
journalEntryRouter.post(
  "/reverse/:id",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "edit"),
  reverse
);

// PATCH /journalentry/update/:id
journalEntryRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "edit"),
  update
);

// DELETE /journalentry/delete/:id
journalEntryRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "journal_entry", "delete"),
  deleteDraft
);

export default journalEntryRouter;
