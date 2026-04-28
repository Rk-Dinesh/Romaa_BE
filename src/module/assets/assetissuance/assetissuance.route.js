import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createIssuance,
  getAllIssuances,
  getIssuanceById,
  recordReturn,
  markIssuanceLost,
  getOverdueIssuances,
  sweepOverdue,
} from "./assetissuance.controller.js";

const assetIssuanceRouter = express.Router();

assetIssuanceRouter.use(verifyJWT);

assetIssuanceRouter.post("/create",                 verifyPermission("asset", "issuance", "create"), createIssuance);
assetIssuanceRouter.get("/getall",                  verifyPermission("asset", "issuance", "read"),   getAllIssuances);
assetIssuanceRouter.get("/overdue",                 verifyPermission("asset", "issuance", "read"),   getOverdueIssuances);
assetIssuanceRouter.post("/sweep-overdue",          verifyPermission("asset", "issuance", "edit"),   sweepOverdue);
assetIssuanceRouter.get("/getbyid/:issueId",        verifyPermission("asset", "issuance", "read"),   getIssuanceById);
assetIssuanceRouter.post("/return/:issueId",        verifyPermission("asset", "issuance", "edit"),   recordReturn);
assetIssuanceRouter.post("/lost/:issueId",          verifyPermission("asset", "issuance", "edit"),   markIssuanceLost);

export default assetIssuanceRouter;
