import { Router } from "express";
import multer from "multer";
import { uploadBillingEstimateCSV, getDetailedBill } from "./billingestimate.controller.js";

const billingEstimateRouter = Router();
const upload = multer({ dest: "uploads/" });

billingEstimateRouter.post("/upload-csv", upload.single("file"), uploadBillingEstimateCSV);
// GET: ?tender_id=TND-001&bill_id=B/25-26/0001
billingEstimateRouter.get("/details", getDetailedBill);


export default billingEstimateRouter;