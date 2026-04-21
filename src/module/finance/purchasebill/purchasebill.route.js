import { Router } from "express";
import { getBills, getBillsByTender, getTenderSummary, getAllTendersSummary, getNextDocId, createPurchaseBill, approvePurchaseBill, getPurchaseBillById, updatePurchaseBill, deletePurchaseBill } from "./purchasebill.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const purchaseBillRouter = Router();

// GET /purchasebill/list?from_date=&to_date=&doc_id=&tender_id=&vendor_id=&tax_mode=&invoice_no=&status=
purchaseBillRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getBills
);

// GET /purchasebill/by-tender/:tenderId
purchaseBillRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getBillsByTender
);

// GET /purchasebill/summary-all
purchaseBillRouter.get(
  "/summary-all",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getAllTendersSummary
);

// GET /purchasebill/summary/:tenderId
purchaseBillRouter.get(
  "/summary/:tenderId",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getTenderSummary
);

// GET /purchasebill/next-id?tender_id=T001
purchaseBillRouter.get(
  "/next-id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getNextDocId
);

// POST /purchasebill/create
purchaseBillRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "create"),
  createPurchaseBill
);

// PATCH /purchasebill/approve/:id
purchaseBillRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "edit"),
  approvePurchaseBill
);

// PATCH /purchasebill/update/:id
purchaseBillRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "edit"),
  updatePurchaseBill
);

// DELETE /purchasebill/delete/:id
purchaseBillRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "delete"),
  deletePurchaseBill
);

// GET /purchasebill/:id  ← must be last
purchaseBillRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getPurchaseBillById
);

export default purchaseBillRouter;
