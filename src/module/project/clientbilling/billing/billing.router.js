import { Router } from "express";
import { createBill, getHistory, getDetails } from "./billing.controller";

const billingRouter = Router();

// POST: Create a new bill (RA1, then RA2...)
billingRouter.post('/api/create', createBill);

// GET: View list of all bills for a project (RA1, RA2, RA3...)
billingRouter.get('/api/history/:tender_id', getHistory);

// GET: View full details (items, measurements) of a specific bill
billingRouter.get('/api/details/:bill_id', getDetails);

export default billingRouter;