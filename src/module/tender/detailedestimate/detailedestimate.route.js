import { Router } from "express";
import multer from "multer";
import { addPhaseBreakdownToAbstractController, addPhaseBreakdownToDetailedController, bulkInsertCustomHeadingsController, bulkInsertHeadingsController, detailedEstimateCustomHeading, extractHeadingInpairs, getCustomHeadingsByTenderAndNameTypeController, getHeadingsByTenderAndNameTypeController } from "./detailedestimate.controller.js";

const upload = multer({ dest: "uploads/" });

const detailedestrouter = Router();

detailedestrouter.post("/addheading", detailedEstimateCustomHeading);
detailedestrouter.get("/extractheadings", extractHeadingInpairs);
detailedestrouter.get("/getdatacustomhead", getCustomHeadingsByTenderAndNameTypeController);
detailedestrouter.get("/getdatahead", getHeadingsByTenderAndNameTypeController);
detailedestrouter.post("/bulkinsertcustomhead", upload.single("file"), bulkInsertCustomHeadingsController);
detailedestrouter.post("/bulkinserthead", upload.single("file"), bulkInsertHeadingsController);

detailedestrouter.post("/addphasebreakdown", addPhaseBreakdownToAbstractController);
detailedestrouter.post("/addphasebreakdowndetailed", addPhaseBreakdownToDetailedController);





export default detailedestrouter;