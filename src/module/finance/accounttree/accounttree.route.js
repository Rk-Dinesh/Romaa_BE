import { Router } from "express";
import {
  getAll,
  getPostingAccounts,
  getTree,
  search,
  getByCode,
  getBySupplier,
  create,
  update,
  softDelete,
  seedAccounts,
} from "./accounttree.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const accountTreeRouter = Router();

// ── Read endpoints ────────────────────────────────────────────────────────────

// GET /accounttree/list
accountTreeRouter.get(
  "/list",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "read"),
  getAll
);

// GET /accounttree/posting-accounts  ← used in voucher entry dropdowns
accountTreeRouter.get(
  "/posting-accounts",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "read"),
  getPostingAccounts
);

// GET /accounttree/tree?root=1000
accountTreeRouter.get(
  "/tree",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "read"),
  getTree
);

// GET /accounttree/search?q=CGST
accountTreeRouter.get(
  "/search",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "read"),
  search
);

// GET /accounttree/by-code/:code
accountTreeRouter.get(
  "/by-code/:code",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "read"),
  getByCode
);

// GET /accounttree/by-supplier/:supplierId?supplier_type=Vendor
accountTreeRouter.get(
  "/by-supplier/:supplierId",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "read"),
  getBySupplier
);

// ── Write endpoints ───────────────────────────────────────────────────────────

// POST /accounttree/create
accountTreeRouter.post(
  "/create",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "create"),
  create
);

// POST /accounttree/seed  ← seed default COA (idempotent)
accountTreeRouter.post(
  "/seed",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "create"),
  seedAccounts
);

// PATCH /accounttree/update/:id
accountTreeRouter.patch(
  "/update/:id",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "edit"),
  update
);

// DELETE /accounttree/delete/:id
accountTreeRouter.delete(
  "/delete/:id",
  // verifyJWT,
  // verifyPermission("finance", "accounttree", "delete"),
  softDelete
);

export default accountTreeRouter;
