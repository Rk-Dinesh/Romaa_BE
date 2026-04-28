import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  getLatestForAsset,
  getHistory,
  syncOneAsset,
  syncAllActive,
} from "./fueltelemetry.controller.js";

const fuelTelemetryRouter = express.Router();

// Read endpoints
fuelTelemetryRouter.get(
  "/asset/:assetId/latest",
  verifyJWT,
  //verifyPermission("purchase", "machinery_tracking", "read"),
  getLatestForAsset
);
fuelTelemetryRouter.get(
  "/asset/:assetId/history",
  verifyJWT,
 // verifyPermission("purchase", "machinery_tracking", "read"),
  getHistory
);

// Manual sync endpoints — require edit permission since they hit the third-party API
fuelTelemetryRouter.post(
  "/sync/:assetId",
  verifyJWT,
  //verifyPermission("purchase", "machinery_tracking", "edit"),
  syncOneAsset
);
fuelTelemetryRouter.post(
  "/sync-all",
  verifyJWT,
//  verifyPermission("purchase", "machinery_tracking", "edit"),
  syncAllActive
);

export default fuelTelemetryRouter;
