import { Router } from "express";
import {
  getSupplierLedger,
  getSupplierBalance,
  getAllSupplierBalances,
  getTenderLedger,
} from "./ledger.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const ledgerRouter = Router();

// GET /ledger/summary
// All suppliers with their outstanding balance (finance overview table)
ledgerRouter.get(
  "/summary",
  // verifyJWT,
  // verifyPermission("finance", "ledger", "read"),
  getAllSupplierBalances
);

// GET /ledger/tender/:tenderId
// All entries for a tender, grouped by supplier with running balance
ledgerRouter.get(
  "/tender/:tenderId",
  // verifyJWT,
  // verifyPermission("finance", "ledger", "read"),
  getTenderLedger
);

// GET /ledger/balance/:supplierId
// Current outstanding balance for one supplier
ledgerRouter.get(
  "/balance/:supplierId",
  // verifyJWT,
  // verifyPermission("finance", "ledger", "read"),
  getSupplierBalance
);

// GET /ledger/supplier/:supplierId
// Full transaction register with running balance
ledgerRouter.get(
  "/supplier/:supplierId",
  // verifyJWT,
  // verifyPermission("finance", "ledger", "read"),
  getSupplierLedger
);

export default ledgerRouter;
