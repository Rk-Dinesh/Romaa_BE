import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createAgreement,
  listAgreements,
  getAgreement,
  updateAgreement,
  generateInvoice,
  listInvoices,
  finalizeInvoice,
  getAssetPnl,
} from "./rental.controller.js";

const rentalRouter = express.Router();
rentalRouter.use(verifyJWT);

// Agreements
rentalRouter.post("/agreement",                                   verifyPermission("asset", "rental", "create"), createAgreement);
rentalRouter.get("/agreements",                                   verifyPermission("asset", "rental", "read"),   listAgreements);
rentalRouter.get("/agreement/:agreementId",                       verifyPermission("asset", "rental", "read"),   getAgreement);
rentalRouter.put("/agreement/:agreementId",                       verifyPermission("asset", "rental", "edit"),   updateAgreement);

// Invoices
rentalRouter.post("/agreement/:agreementId/invoice",              verifyPermission("asset", "rental", "create"), generateInvoice);
rentalRouter.get("/invoices",                                     verifyPermission("asset", "rental", "read"),   listInvoices);
rentalRouter.post("/invoice/:invoiceId/finalize",                 verifyPermission("asset", "rental", "edit"),   finalizeInvoice);

// P&L
rentalRouter.get("/pnl/:assetId",                                 verifyPermission("asset", "rental", "read"),   getAssetPnl);

export default rentalRouter;
