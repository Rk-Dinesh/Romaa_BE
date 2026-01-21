import { Router } from "express";
import multer from "multer";
import { uploadBillingEstimateCSV, getDetailedBill } from "./billingestimate.controller.js";

const billingEstimateRouter = Router();
const upload = multer({ dest: "uploads/" });

billingEstimateRouter.post("/upload-csv", upload.single("file"), uploadBillingEstimateCSV);
billingEstimateRouter.get("/details/:tender_id/:bill_id/:abstract_name/:bill_sequence", getDetailedBill);


export default billingEstimateRouter;