import { Router } from "express";
import { uploadBillingEstimateCSV, getDetailedSteelEstimate } from "./steelestimate.controller.js";
import multer from "multer";

const steelestimaterouter = Router();

const upload = multer({ dest: "uploads/" });

steelestimaterouter.post("/upload-csv", upload.single("file"), uploadBillingEstimateCSV);
steelestimaterouter.get("/details/:tender_id/:bill_id/:abstract_name/:bill_sequence", getDetailedSteelEstimate);

export default steelestimaterouter;