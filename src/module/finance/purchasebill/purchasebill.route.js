import { Router } from "express";
import { createPurchaseBill } from "./purchasebill.controller.js";

const purchaseBillRouter = Router();

// POST /purchasebill/create
purchaseBillRouter.post("/create", createPurchaseBill);

export default purchaseBillRouter;
