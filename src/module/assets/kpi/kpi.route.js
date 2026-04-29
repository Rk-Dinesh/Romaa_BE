import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  computeAssetKpi,
  computeAll,
  getAssetKpi,
  getProjectRollup,
  getFleetRollup,
} from "./kpi.controller.js";

const kpiRouter = express.Router();
kpiRouter.use(verifyJWT);

kpiRouter.post("/compute/:assetId",            verifyPermission("asset", "kpi", "edit"), computeAssetKpi);
kpiRouter.post("/compute-all",                 verifyPermission("asset", "kpi", "edit"), computeAll);
kpiRouter.get("/asset/:assetId",               verifyPermission("asset", "kpi", "read"), getAssetKpi);
kpiRouter.get("/project-rollup",               verifyPermission("asset", "kpi", "read"), getProjectRollup);
kpiRouter.get("/fleet-rollup",                 verifyPermission("asset", "kpi", "read"), getFleetRollup);

export default kpiRouter;
