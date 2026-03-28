import { Router } from "express";
import { createBill, getHistory, getDetails, approveBill } from "./clientbilling.controller.js";
import { verifyJWT, verifyPermission } from "../../../../common/Auth.middlware.js";

const billingRouter = Router();

// POST: Create a new bill (RA1, then RA2...)
billingRouter.post('/api/create', createBill);

// GET: View list of all bills for a project (RA1, RA2, RA3...)
billingRouter.get('/api/history/:tender_id', getHistory);

// GET: View full details (items, measurements) of a specific bill
billingRouter.get('/api/details/:tender_id/:bill_id', getDetails);

// PATCH: Approve a bill — posts to client receivable ledger
billingRouter.patch(
  '/api/approve/:id',
  verifyJWT,
  verifyPermission("finance", "clientbilling", "edit"),
  approveBill
);

export default billingRouter;