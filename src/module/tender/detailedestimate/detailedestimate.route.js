import { Router } from "express";
import multer from "multer";
import { addPhaseBreakdownToAbstractController, addPhaseBreakdownToDetailedController, bulkInsertCustomHeadingsController, detailedEstimateCustomHeading, extractHeadingInpairs, getBillOfQtyController, getCustomHeadingsByTenderAndNameTypeController, getGeneralAbstractController } from "./detailedestimate.controller.js";

const upload = multer({ dest: "uploads/" });

const detailedestrouter = Router();

detailedestrouter.post("/addheading", detailedEstimateCustomHeading);
detailedestrouter.get("/extractheadings", extractHeadingInpairs);
detailedestrouter.get("/getdatacustomhead", getCustomHeadingsByTenderAndNameTypeController);
detailedestrouter.post("/bulkinsertcustomhead", upload.single("file"), bulkInsertCustomHeadingsController);
detailedestrouter.get("/getgeneralabstract", getGeneralAbstractController);
detailedestrouter.get("/getbillofqty", getBillOfQtyController);
detailedestrouter.post("/addphasebreakdown", addPhaseBreakdownToAbstractController);
detailedestrouter.post("/addphasebreakdowndetailed", addPhaseBreakdownToDetailedController);

export default detailedestrouter;
