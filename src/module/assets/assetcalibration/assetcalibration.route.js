import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createCalibration,
  getAllCalibrations,
  getCalibrationById,
  getCalibrationHistoryForAsset,
  updateCalibration,
  deleteCalibration,
  getCalibrationDueReport,
} from "./assetcalibration.controller.js";

const assetCalibrationRouter = express.Router();

assetCalibrationRouter.use(verifyJWT);

assetCalibrationRouter.post("/create",                       verifyPermission("asset", "calibration", "create"), createCalibration);
assetCalibrationRouter.get("/getall",                        verifyPermission("asset", "calibration", "read"),   getAllCalibrations);
assetCalibrationRouter.get("/due-report",                    verifyPermission("asset", "calibration", "read"),   getCalibrationDueReport);
assetCalibrationRouter.get("/getbyid/:calibrationId",        verifyPermission("asset", "calibration", "read"),   getCalibrationById);
assetCalibrationRouter.get("/history/:assetIdLabel",         verifyPermission("asset", "calibration", "read"),   getCalibrationHistoryForAsset);
assetCalibrationRouter.put("/update/:calibrationId",         verifyPermission("asset", "calibration", "edit"),   updateCalibration);
assetCalibrationRouter.delete("/delete/:calibrationId",      verifyPermission("asset", "calibration", "delete"), deleteCalibration);

export default assetCalibrationRouter;
