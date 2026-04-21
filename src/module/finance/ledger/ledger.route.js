import { Router } from "express";
import {
  getSupplierLedger,
  getSupplierBalance,
  getSupplierStatement,
  getAllSupplierBalances,
  getTenderLedger,
  getTenderBalance,
  getTrialBalance,
  getAccountLedger,
  getCashBook,
  getITCRegister,
} from "./ledger.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const ledgerRouter = Router();

// GET /ledger/summary
// All suppliers with their outstanding balance (finance overview table)
ledgerRouter.get(
  "/summary",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getAllSupplierBalances
);

// GET /ledger/tender-balance/:tenderId
// Single total outstanding for a tender with breakdown by voucher type
ledgerRouter.get(
  "/tender-balance/:tenderId",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getTenderBalance
);

// GET /ledger/tender/:tenderId
// All entries for a tender, grouped by supplier with running balance
ledgerRouter.get(
  "/tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getTenderLedger
);

// GET /ledger/balance/:supplierId
// Current outstanding balance for one supplier
ledgerRouter.get(
  "/balance/:supplierId",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getSupplierBalance
);

// GET /ledger/statement/:supplierId
// Payables statement broken down by voucher type — for reconciliation
ledgerRouter.get(
  "/statement/:supplierId",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getSupplierStatement
);

// GET /ledger/supplier/:supplierId
// Full transaction register with running balance (and Opening Balance B/F when from_date used)
ledgerRouter.get(
  "/supplier/:supplierId",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getSupplierLedger
);

// GET /ledger/trial-balance
ledgerRouter.get(
  "/trial-balance",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getTrialBalance
);

// GET /ledger/cash-book
ledgerRouter.get(
  "/cash-book",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getCashBook
);

// GET /ledger/itc-register
ledgerRouter.get(
  "/itc-register",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getITCRegister
);

// GET /ledger/account/:accountCode  ← general ledger per account
ledgerRouter.get(
  "/account/:accountCode",
  verifyJWT,
  verifyPermission("finance", "ledger_entry", "read"),
  getAccountLedger
);

export default ledgerRouter;
