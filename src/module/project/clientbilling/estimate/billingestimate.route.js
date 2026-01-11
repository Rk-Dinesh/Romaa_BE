import { Router } from "express";
import multer from "multer";
import { uploadBillingEstimateCSV } from "./billingestimate.controller.js";

const billingEstimateRouter = Router();
const upload = multer({ dest: "uploads/" });

billingEstimateRouter.post("/upload-csv", upload.single("file"), uploadBillingEstimateCSV);


export default billingEstimateRouter;