import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { vendors, contractors, vendorDetail, contractorDetail } from "./supplierscorecard.controller.js";

const router = Router();

router.get("/vendors",                    verifyJWT, vendors);
router.get("/contractors",                verifyJWT, contractors);
router.get("/vendor/:vendor_id",          verifyJWT, vendorDetail);
router.get("/contractor/:contractor_id",  verifyJWT, contractorDetail);

export default router;
