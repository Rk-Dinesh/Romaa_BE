import { Router } from "express";
import { getBills, getBillsByTender, getTenderSummary, getAllTendersSummary, getNextDocId, createPurchaseBill, approvePurchaseBill } from "./purchasebill.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const purchaseBillRouter = Router();

// GET /purchasebill/list?from_date=&to_date=&doc_id=&tender_id=&vendor_id=&tax_mode=&invoice_no=&status=
purchaseBillRouter.get(
  "/list",
  // verifyJWT,
  // verifyPermission("finance", "purchasebill", "read"),
  getBills
);

// GET /purchasebill/by-tender/:tenderId
purchaseBillRouter.get(
  "/by-tender/:tenderId",
  // verifyJWT,
  // verifyPermission("finance", "purchasebill", "read"),
  getBillsByTender
);

// GET /purchasebill/summary-all
purchaseBillRouter.get(
  "/summary-all",
  // verifyJWT,
  // verifyPermission("finance", "purchasebill", "read"),
  getAllTendersSummary
);

// GET /purchasebill/summary/:tenderId
purchaseBillRouter.get(
  "/summary/:tenderId",
  // verifyJWT,
  // verifyPermission("finance", "purchasebill", "read"),
  getTenderSummary
);

// GET /purchasebill/next-id?tender_id=T001
purchaseBillRouter.get(
  "/next-id",
  // verifyJWT,
  // verifyPermission("finance", "purchasebill", "read"),
  getNextDocId
);

// POST /purchasebill/create
purchaseBillRouter.post(
  "/create",
  // verifyJWT,
  // verifyPermission("finance", "purchasebill", "create"),
  createPurchaseBill
);

// PATCH /purchasebill/approve/:id
purchaseBillRouter.patch(
  "/approve/:id",
  // verifyJWT,
  // verifyPermission("finance", "purchasebill", "edit"),
  approvePurchaseBill
);

export default purchaseBillRouter;
