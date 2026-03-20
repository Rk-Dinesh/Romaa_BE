import { Router } from "express";
import {
  getBillingList,
  getBillDetail,
  getSubBillTransactions,
  getVendorSummary,
  generateBill,
  updateStatus,
} from "./weeklyBilling.controller.js";

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
//  PATCH /weeklyBilling/api/status/:billId
//       Update bill status: Generated → Pending → Paid | Cancelled
// ──────────────────────────────────────────────────────────────────────────────

const weeklyBillingRouter = Router();

weeklyBillingRouter.get("/api/list/:tenderId",                getBillingList);
weeklyBillingRouter.get("/api/detail/:billNo",                getBillDetail);
weeklyBillingRouter.get("/api/sub-bill/:subBillNo",           getSubBillTransactions);
weeklyBillingRouter.get("/api/vendor-summary/:tenderId",      getVendorSummary);
weeklyBillingRouter.post("/api/generate",                     generateBill);
weeklyBillingRouter.patch("/api/status/:billId",              updateStatus);

export default weeklyBillingRouter;
