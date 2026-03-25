import { Router } from "express";
import {
  getBillingList,
  getBillDetail,
  getSubBillTransactions,
  getContractorSummary,
  generateBill,
  approveBill,
  updateStatus,
} from "./weeklyBilling.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

// ──────────────────────────────────────────────────────────────────────────────
//  GET  /weeklyBilling/api/list/:tenderId
//       All generated bills for a tender (newest first)
//
//  GET  /weeklyBilling/api/detail/:billNo
//       Full bill + all line-item transactions
//       (billNo contains "/" — URL-encode it: WB%2FTND-001%2F25-26%2F0001)
//
//  GET  /weeklyBilling/api/sub-bill/:subBillNo
//       All line-item transactions for one sub-bill
//
//  GET  /weeklyBilling/api/vendor-summary/:tenderId?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
//       Work-done grouped by vendor → work_order for the date range
//
//  POST /weeklyBilling/api/generate
//       Generate a new bill (returns 409 on overlapping period for same vendor)
//
//  PATCH /weeklyBilling/api/approve/:billId
//       Approve a bill (Generated/Pending → Approved) + posts to ledger
//
//  PATCH /weeklyBilling/api/status/:billId
//       Generic status update: Generated → Pending → Approved | Cancelled
// ──────────────────────────────────────────────────────────────────────────────

const weeklyBillingRouter = Router();

weeklyBillingRouter.get(
  "/api/list/:tenderId",
  verifyJWT,
 // verifyPermission("finance", "weeklybilling", "read"),
  getBillingList,
);
weeklyBillingRouter.get(
  "/api/detail/:billNo",
  verifyJWT,
//  verifyPermission("finance", "weeklybilling", "read"),
  getBillDetail,
);
weeklyBillingRouter.get(
  "/api/sub-bill/:subBillNo",
  verifyJWT,
//  verifyPermission("finance", "weeklybilling", "read"),
  getSubBillTransactions,
);
weeklyBillingRouter.get(
  "/api/contractor-summary/:tenderId",
  verifyJWT,
 // verifyPermission("finance", "weeklybilling", "read"),
  getContractorSummary,
);
weeklyBillingRouter.post(
  "/api/generate",
  verifyJWT,
 // verifyPermission("finance", "weeklybilling", "create"),
  generateBill,
);
weeklyBillingRouter.patch(
  "/api/approve/:billId",
  verifyJWT,
// verifyPermission("finance", "weeklybilling", "edit"),
  approveBill,
);
weeklyBillingRouter.patch(
  "/api/status/:billId",
  verifyJWT,
//  verifyPermission("finance", "weeklybilling", "edit"),
  updateStatus,
);

export default weeklyBillingRouter;
