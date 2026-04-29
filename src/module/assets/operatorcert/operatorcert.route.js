import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createCert,
  listCerts,
  getCert,
  updateCert,
  revokeCert,
  verifyAuthorized,
} from "./operatorcert.controller.js";

const operatorCertRouter = express.Router();
operatorCertRouter.use(verifyJWT);

operatorCertRouter.post("/create",                    verifyPermission("asset", "operator_cert", "create"), createCert);
operatorCertRouter.get("/getall",                     verifyPermission("asset", "operator_cert", "read"),   listCerts);
operatorCertRouter.get("/verify",                     verifyPermission("asset", "operator_cert", "read"),   verifyAuthorized);
operatorCertRouter.get("/getbyid/:certId",            verifyPermission("asset", "operator_cert", "read"),   getCert);
operatorCertRouter.put("/update/:certId",             verifyPermission("asset", "operator_cert", "edit"),   updateCert);
operatorCertRouter.post("/revoke/:certId",            verifyPermission("asset", "operator_cert", "edit"),   revokeCert);

export default operatorCertRouter;
