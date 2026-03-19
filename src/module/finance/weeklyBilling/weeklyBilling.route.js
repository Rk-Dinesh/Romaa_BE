import { Router } from "express";
import { generateBill, getBillingList, getVendorSummary, updateStatus } from "./weeklyBilling.controller.js";


// ── Routes ─────────────────────────────────────────────────────────────────────
//
//  GET  /weeklyBilling/api/list/:tenderId
//       → All generated bills for a tender (newest first)
//
//  GET  /weeklyBilling/api/vendor-summary/:tenderId?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
//       → Work done grouped by vendor for the date range
//         Used to populate vendor dropdown + preview table in the modal
//
//  POST /weeklyBilling/api/generate
//       → Generate (save) a new bill
//         Returns 409 if vendor is already billed for an overlapping period
//
//  PATCH /weeklyBilling/api/status/:billId
//       → Update bill status: Generated | Pending | Paid | Cancelled
// ──────────────────────────────────────────────────────────────────────────────
const weeklyBillingRouter = Router();
weeklyBillingRouter.get("/api/list/:tenderId", getBillingList);
weeklyBillingRouter.get("/api/vendor-summary/:tenderId", getVendorSummary);
weeklyBillingRouter.post("/api/generate", generateBill);
weeklyBillingRouter.patch("/api/status/:billId",updateStatus);

export default weeklyBillingRouter;
