import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  getLatestForAsset,
  getHistory,
  syncOneAsset,
  syncAllActive,
} from "./fueltelemetry.controller.js";

const fuelTelemetryRouter = express.Router();
fuelTelemetryRouter.use(verifyJWT);

fuelTelemetryRouter.get("/asset/:assetId/latest",   verifyPermission("asset", "fuel_telemetry", "read"),   getLatestForAsset);
fuelTelemetryRouter.get("/asset/:assetId/history",  verifyPermission("asset", "fuel_telemetry", "read"),   getHistory);
fuelTelemetryRouter.post("/sync/:assetId",          verifyPermission("asset", "fuel_telemetry", "edit"),   syncOneAsset);
fuelTelemetryRouter.post("/sync-all",               verifyPermission("asset", "fuel_telemetry", "edit"),   syncAllActive);

export default fuelTelemetryRouter;
