import { Router } from "express";
import { getNextDocId, createPurchaseBill } from "./purchasebill.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const purchaseBillRouter = Router();

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

export default purchaseBillRouter;
