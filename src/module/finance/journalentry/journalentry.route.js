import { Router } from "express";
import {
  getNextJeNo,
  getList,
  getById,
  create,
  approve,
  reverse,
  processAutoReversals,
} from "./journalentry.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const journalEntryRouter = Router();

// GET /journalentry/next-no
journalEntryRouter.get(
  "/next-no",
  // verifyJWT,
  // verifyPermission("finance", "journalentry", "read"),
  getNextJeNo
);

// GET /journalentry/list
journalEntryRouter.get(
  "/list",
  // verifyJWT,
  // verifyPermission("finance", "journalentry", "read"),
  getList
);

// POST /journalentry/process-auto-reversals  — must be before /:id
journalEntryRouter.post(
  "/process-auto-reversals",
  // verifyJWT,
  // verifyPermission("finance", "journalentry", "edit"),
  processAutoReversals
);

// GET /journalentry/:id
journalEntryRouter.get(
  "/:id",
  // verifyJWT,
  // verifyPermission("finance", "journalentry", "read"),
  getById
);

// POST /journalentry/create
journalEntryRouter.post(
  "/create",
  // verifyJWT,
  // verifyPermission("finance", "journalentry", "create"),
  create
);

// PATCH /journalentry/approve/:id
journalEntryRouter.patch(
  "/approve/:id",
  // verifyJWT,
  // verifyPermission("finance", "journalentry", "edit"),
  approve
);

// POST /journalentry/reverse/:id
journalEntryRouter.post(
  "/reverse/:id",
  // verifyJWT,
  // verifyPermission("finance", "journalentry", "edit"),
  reverse
);

export default journalEntryRouter;
