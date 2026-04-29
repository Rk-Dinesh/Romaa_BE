import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createClaim,
  listClaims,
  getClaim,
  updateClaim,
  transitionClaim,
  addClaimDocument,
  getClaimSummary,
} from "./insuranceclaim.controller.js";

const insuranceClaimRouter = express.Router();
insuranceClaimRouter.use(verifyJWT);

insuranceClaimRouter.post("/create",                          verifyPermission("asset", "insurance_claim", "create"), createClaim);
insuranceClaimRouter.get("/getall",                           verifyPermission("asset", "insurance_claim", "read"),   listClaims);
insuranceClaimRouter.get("/summary",                          verifyPermission("asset", "insurance_claim", "read"),   getClaimSummary);
insuranceClaimRouter.get("/getbyid/:claimId",                 verifyPermission("asset", "insurance_claim", "read"),   getClaim);
insuranceClaimRouter.put("/update/:claimId",                  verifyPermission("asset", "insurance_claim", "edit"),   updateClaim);
insuranceClaimRouter.post("/transition/:claimId",             verifyPermission("asset", "insurance_claim", "edit"),   transitionClaim);
insuranceClaimRouter.post("/document/:claimId",               verifyPermission("asset", "insurance_claim", "edit"),   addClaimDocument);

export default insuranceClaimRouter;
