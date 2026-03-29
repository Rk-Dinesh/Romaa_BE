import { Router } from "express";
import multer from "multer";
import {  getHistory, getDetails, getBillById, approveBill, uploadBillingCSV, updateBillingCSV } from "./clientbilling.controller.js";
import { verifyJWT, verifyPermission } from "../../../../common/Auth.middlware.js";

const billingRouter = Router();
const upload = multer({ dest: "uploads/" });

billingRouter.post("/upload-csv", upload.single("file"), uploadBillingCSV);

// PATCH: Update existing bill by re-uploading CSV — ?bill_id=B/25-26/0001 (Draft only)
billingRouter.patch("/update-csv", upload.single("file"), updateBillingCSV);

// GET: View list of all bills for a project (RA1, RA2, RA3...)
billingRouter.get('/history/:tender_id', getHistory);

// GET: View full details (items, measurements) of a specific bill
// ?tender_id=TND-001&bill_id=B/25-26/0001
billingRouter.get('/api/details', getDetails);

// GET: Bill details by bill_id only — items with current_qty = 0 excluded
// Use query param to avoid slash conflicts: /api/bill?bill_id=B/25-26/0001
billingRouter.get('/api/bill', getBillById);

// PATCH: Approve a bill — posts to client receivable ledger
billingRouter.patch(
  '/api/approve/:id',
  verifyJWT,
//  verifyPermission("finance", "clientbilling", "edit"),
  approveBill
);

export default billingRouter;