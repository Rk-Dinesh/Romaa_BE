import { Router } from "express";
import multer from "multer";
import { verifyJWT, verifyPermission } from "../../../../common/Auth.middlware.js";
import {
  uploadBillingEstimateCSV,
  getDetailedBill,
  getEstimatesForBill,
} from "./billingestimate.controller.js";

const billingEstimateRouter = Router();
const upload = multer({ dest: "uploads/" });

const auth = verifyJWT;
const read = verifyPermission("finance", "clientbilling", "read");
const create = verifyPermission("finance", "clientbilling", "create");

// Upload estimate CSV — bill_id must be passed in body (bill must exist already)
billingEstimateRouter.post(
  "/upload-csv",
  auth, create,
  upload.single("file"),
  uploadBillingEstimateCSV
);

// List all estimate types uploaded for a specific bill
billingEstimateRouter.get(
  "/list/:tender_id/:bill_id",
  auth, read,
  getEstimatesForBill
);

// Get full detail of one estimate type for a bill
billingEstimateRouter.get(
  "/details/:tender_id/:bill_id/:abstract_name/:bill_sequence",
  auth, read,
  getDetailedBill
);

export default billingEstimateRouter;
