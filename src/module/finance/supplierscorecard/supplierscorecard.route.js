import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { vendors, contractors, vendorDetail, contractorDetail } from "./supplierscorecard.controller.js";

const router = Router();

router.get("/vendors",                    verifyJWT, verifyPermission("finance", "supplier_scorecard", "read"), vendors);
router.get("/contractors",                verifyJWT, verifyPermission("finance", "supplier_scorecard", "read"), contractors);
router.get("/vendor/:vendor_id",          verifyJWT, verifyPermission("finance", "supplier_scorecard", "read"), vendorDetail);
router.get("/contractor/:contractor_id",  verifyJWT, verifyPermission("finance", "supplier_scorecard", "read"), contractorDetail);

export default router;
