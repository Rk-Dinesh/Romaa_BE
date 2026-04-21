import { Router } from "express";
import {
  getAll,
  getById,
  getPostingAccounts,
  getTree,
  search,
  getByCode,
  getBySupplier,
  create,
  update,
  softDelete,
  seedAccounts,
  migrateAvailableBalance,
} from "./accounttree.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const accountTreeRouter = Router();

// ── Read endpoints ────────────────────────────────────────────────────────────

// GET /accounttree/list
accountTreeRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "read"),
  getAll
);

// GET /accounttree/posting-accounts  ← used in voucher entry dropdowns
accountTreeRouter.get(
  "/posting-accounts",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "read"),
  getPostingAccounts
);

// GET /accounttree/tree?root=1000
accountTreeRouter.get(
  "/tree",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "read"),
  getTree
);

// GET /accounttree/search?q=CGST
accountTreeRouter.get(
  "/search",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "read"),
  search
);

// GET /accounttree/by-code/:code
accountTreeRouter.get(
  "/by-code/:code",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "read"),
  getByCode
);

// GET /accounttree/by-supplier/:supplierId?supplier_type=Vendor
accountTreeRouter.get(
  "/by-supplier/:supplierId",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "read"),
  getBySupplier
);

// ── Write endpoints ───────────────────────────────────────────────────────────

// POST /accounttree/create
accountTreeRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "create"),
  create
);

// POST /accounttree/seed  ← seed default COA (idempotent)
accountTreeRouter.post(
  "/seed",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "create"),
  seedAccounts
);

// POST /accounttree/migrate-available-balance  ← one-time migration
accountTreeRouter.post(
  "/migrate-available-balance",
  verifyJWT,
  migrateAvailableBalance
);

// PATCH /accounttree/update/:id
accountTreeRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "edit"),
  update
);

// DELETE /accounttree/delete/:id
accountTreeRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "delete"),
  softDelete
);

// GET /accounttree/:id  ← must be last to avoid catching /list, /tree, /search, etc.
accountTreeRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "read"),
  getById
);

export default accountTreeRouter;
