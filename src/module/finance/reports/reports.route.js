import { Router } from "express";
import {
  getTrialBalance,
  getProfitLoss,
  getBalanceSheet,
  getGeneralLedger,
  getCashFlow,
  getGstr1,
  getGstr2b,
  getGstr3b,
  getItcReversalRegister,
  getTdsRegister,
  getArAging,
  getApAging,
  getForm26Q,
  getForm26QCsv,
} from "./reports.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const reportsRouter = Router();

// GET /reports/trial-balance?as_of_date=&include_zero=
reportsRouter.get(
  "/trial-balance",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getTrialBalance,
);

// GET /reports/profit-loss?from_date=&to_date=&tender_id=
reportsRouter.get(
  "/profit-loss",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getProfitLoss,
);

// GET /reports/balance-sheet?as_of_date=
reportsRouter.get(
  "/balance-sheet",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getBalanceSheet,
);

// GET /reports/general-ledger?account_code=&from_date=&to_date=&page=&limit=
reportsRouter.get(
  "/general-ledger",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getGeneralLedger,
);

// GET /reports/cash-flow?from_date=&to_date=
reportsRouter.get(
  "/cash-flow",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getCashFlow,
);

// ── GST returns ─────────────────────────────────────────────────────────────
// GET /reports/gstr-1?from_date=&to_date=
reportsRouter.get(
  "/gstr-1",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getGstr1,
);

// GET /reports/gstr-2b?from_date=&to_date=
reportsRouter.get(
  "/gstr-2b",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getGstr2b,
);

// GET /reports/gstr-3b?from_date=&to_date=
reportsRouter.get(
  "/gstr-3b",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getGstr3b,
);

// GET /reports/itc-reversal?from_date=&to_date=
reportsRouter.get(
  "/itc-reversal",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getItcReversalRegister,
);

// ── TDS register / 26Q-27Q data ─────────────────────────────────────────────
// GET /reports/tds-register?from_date=&to_date=&section=
reportsRouter.get(
  "/tds-register",
  verifyJWT,
 // verifyPermission("finance", "reports", "read"),
  getTdsRegister,
);

// ── Aging reports ───────────────────────────────────────────────────────────
// GET /reports/ar-aging?as_of=&tender_id=&client_id=
reportsRouter.get(
  "/ar-aging",
  verifyJWT,
  getArAging,
);

// GET /reports/ap-aging?as_of=&tender_id=&vendor_id=&contractor_id=
reportsRouter.get(
  "/ap-aging",
  verifyJWT,
  getApAging,
);

// ── Form 26Q (Quarterly TDS Statement) ──────────────────────────────────────
// GET /reports/form-26q?financial_year=25-26&quarter=Q1&tan=&deductor_name=&deductor_pan=&deductor_address=
reportsRouter.get(
  "/form-26q",
  verifyJWT,
  getForm26Q,
);

// GET /reports/form-26q/csv?financial_year=25-26&quarter=Q1   (downloads a CSV)
reportsRouter.get(
  "/form-26q/csv",
  verifyJWT,
  getForm26QCsv,
);

export default reportsRouter;
