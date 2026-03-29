import { Router } from "express";
import { uploadBillingEstimateCSV, getDetailedSteelEstimate } from "./steelestimate.controller.js";
import multer from "multer";

const steelestimaterouter = Router();

const upload = multer({ dest: "uploads/" });

steelestimaterouter.post("/upload-csv", upload.single("file"), uploadBillingEstimateCSV);
// GET: ?tender_id=TND-001&bill_id=B/25-26/0001
steelestimaterouter.get("/details", getDetailedSteelEstimate);

export default steelestimaterouter;