import { Router } from "express";
import multer from "multer";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { addPhaseBreakdownToAbstractController, addPhaseBreakdownToDetailedController,  bulkInsertCustomHeadingsController, bulkInsertCustomHeadingsControllerNew, detailedEstimateCustomHeading, extractHeadingInpairs, getBillOfQtyController, getCustomHeadingsByTenderAndNameTypeController, getGeneralAbstractController } from "./drawingvsboqDE.controller.js";

const upload = multer({ dest: "uploads/" });

const drawingVsBOQDERouter = Router();
drawingVsBOQDERouter.use(verifyJWT);

drawingVsBOQDERouter.post("/addheading", detailedEstimateCustomHeading);
drawingVsBOQDERouter.get("/extractheadings", extractHeadingInpairs);
drawingVsBOQDERouter.get("/getdatacustomhead", getCustomHeadingsByTenderAndNameTypeController);
drawingVsBOQDERouter.post("/bulkinsertcustomhead", upload.single("file"), bulkInsertCustomHeadingsController);
drawingVsBOQDERouter.post("/bulkinsertcustomheadnew", upload.single("file"), bulkInsertCustomHeadingsControllerNew);
drawingVsBOQDERouter.get("/getgeneralabstract", getGeneralAbstractController);
drawingVsBOQDERouter.get("/getbillofqty", getBillOfQtyController);
drawingVsBOQDERouter.post("/addphasebreakdown", addPhaseBreakdownToAbstractController);
drawingVsBOQDERouter.post("/addphasebreakdowndetailed", addPhaseBreakdownToDetailedController);

export default drawingVsBOQDERouter;
