import { Router } from "express";
import {
  getTrialBalance,
  getProfitLoss,
  getBalanceSheet,
  getGeneralLedger,
  getCashFlow,
  getCashFlowForecast,
  getFundFlow,
  getRatioAnalysis,
  getTenderProfitability,
  getGstr1,
  getGstr2b,
  getGstr3b,
  getItcReversalRegister,
  getTdsRegister,
  getArAging,
  getApAging,
  getForm26Q,
  getForm26QCsv,
  getForm24Q,
  getForm24QCsv,
  getForm16,
  getForm16A,
  getAuditTrail,
  getAuditTrailForDocument,
  getGstr9,
} from "./reports.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const reportsRouter = Router();

// GET /reports/trial-balance?as_of_date=&include_zero=
reportsRouter.get(
  "/trial-balance",
  verifyJWT,
  verifyPermission("finance", "trial_balance", "read"),
  getTrialBalance,
);

// GET /reports/profit-loss?from_date=&to_date=&tender_id=
reportsRouter.get(
  "/profit-loss",
  verifyJWT,
  verifyPermission("finance", "profit_loss", "read"),
  getProfitLoss,
);

// GET /reports/balance-sheet?as_of_date=
reportsRouter.get(
  "/balance-sheet",
  verifyJWT,
  verifyPermission("finance", "balance_sheet", "read"),
  getBalanceSheet,
);

// GET /reports/general-ledger?account_code=&from_date=&to_date=&page=&limit=
reportsRouter.get(
  "/general-ledger",
  verifyJWT,
  verifyPermission("finance", "general_ledger", "read"),
  getGeneralLedger,
);

// GET /reports/cash-flow?from_date=&to_date=
reportsRouter.get(
  "/cash-flow",
  verifyJWT,
  verifyPermission("finance", "cash_flow", "read"),
  getCashFlow,
);

// GET /reports/cash-flow-forecast?as_of=&horizon_days=&client_credit_days=&contractor_credit_days=
reportsRouter.get(
  "/cash-flow-forecast",
  verifyJWT,
  verifyPermission("finance", "cash_flow", "read"),
  getCashFlowForecast,
);

// GET /reports/fund-flow?opening_date=&closing_date=
reportsRouter.get(
  "/fund-flow",
  verifyJWT,
  verifyPermission("finance", "cash_flow", "read"),
  getFundFlow,
);

// GET /reports/ratio-analysis?as_of_date=
reportsRouter.get(
  "/ratio-analysis",
  verifyJWT,
  verifyPermission("finance", "trial_balance", "read"),
  getRatioAnalysis,
);

// GET /reports/tender-profitability?from_date=&to_date=&tender_id=
reportsRouter.get(
  "/tender-profitability",
  verifyJWT,
  verifyPermission("finance", "profit_loss", "read"),
  getTenderProfitability,
);

// ── GST returns ─────────────────────────────────────────────────────────────
// GET /reports/gstr-1?from_date=&to_date=
reportsRouter.get(
  "/gstr-1",
  verifyJWT,
  verifyPermission("finance", "gstr1", "read"),
  getGstr1,
);

// GET /reports/gstr-2b?from_date=&to_date=
reportsRouter.get(
  "/gstr-2b",
  verifyJWT,
  verifyPermission("finance", "gstr2b", "read"),
  getGstr2b,
);

// GET /reports/gstr-3b?from_date=&to_date=
reportsRouter.get(
  "/gstr-3b",
  verifyJWT,
  verifyPermission("finance", "gstr3b", "read"),
  getGstr3b,
);

// GET /reports/itc-reversal?from_date=&to_date=
reportsRouter.get(
  "/itc-reversal",
  verifyJWT,
  verifyPermission("finance", "itc_reversal", "read"),
  getItcReversalRegister,
);

// ── TDS register / 26Q-27Q data ─────────────────────────────────────────────
// GET /reports/tds-register?from_date=&to_date=&section=
reportsRouter.get(
  "/tds-register",
  verifyJWT,
  verifyPermission("finance", "tds_register", "read"),
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

// ── Form 24Q (Quarterly TDS Statement — Salaries u/s 192) ──────────────────
// GET /reports/form-24q?financial_year=25-26&quarter=Q1&tan=&deductor_name=&deductor_pan=&deductor_address=
reportsRouter.get(
  "/form-24q",
  verifyJWT,
  getForm24Q,
);

// GET /reports/form-24q/csv?financial_year=25-26&quarter=Q1   (downloads a CSV)
reportsRouter.get(
  "/form-24q/csv",
  verifyJWT,
  getForm24QCsv,
);

// ── Form 16 (Annual TDS certificate — Salary, one per employee) ────────────
// GET /reports/form-16?financial_year=25-26&employee_id=<oid>&tan=&deductor_name=&...
reportsRouter.get(
  "/form-16",
  verifyJWT,
  getForm16,
);

// ── Form 16A (Quarterly TDS certificate — Non-salary, per deductee × section)
// GET /reports/form-16a?financial_year=25-26&quarter=Q1&deductee_id=&section=
reportsRouter.get(
  "/form-16a",
  verifyJWT,
  getForm16A,
);

// ── Audit Trail (Companies Act 2013 Rule 11(g) compliance) ─────────────────
// GET /reports/audit-trail?from_date=&to_date=&doc_type=&je_type=&user_id=&source_no=&je_no=&tender_id=&page=&limit=
reportsRouter.get(
  "/audit-trail",
  verifyJWT,
  getAuditTrail,
);

// GET /reports/audit-trail/document?source_type=PaymentVoucher&source_no=PV/25-26/0001
reportsRouter.get(
  "/audit-trail/document",
  verifyJWT,
  getAuditTrailForDocument,
);

// ── GSTR-9 (Annual GST Return) ──────────────────────────────────────────────
// GET /reports/gstr-9?financial_year=25-26
reportsRouter.get(
  "/gstr-9",
  verifyJWT,
  getGstr9,
);

export default reportsRouter;
