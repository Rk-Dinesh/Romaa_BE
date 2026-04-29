import { Router } from "express";
import multer from "multer";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { addPhaseBreakdownToAbstractController, addPhaseBreakdownToDetailedController, bulkInsertCustomHeadingsController, bulkInsertCustomHeadingsControllerNew, deleteAbstractDataByNametypeController, deleteHeadingController, detailedEstimateCustomHeading, extractHeadingInpairs, freezeDetailedEstimateController, getBillOfQtyController, getCustomHeadingsByTenderAndNameTypeController, getGeneralAbstractController } from "./detailedestimate.controller.js";

const upload = multer({ dest: "uploads/" });

const detailedestrouter = Router();
detailedestrouter.use(verifyJWT);

detailedestrouter.post("/addheading", detailedEstimateCustomHeading); 
detailedestrouter.get("/extractheadings", extractHeadingInpairs);
detailedestrouter.get("/getdatacustomhead", getCustomHeadingsByTenderAndNameTypeController);
detailedestrouter.post("/bulkinsertcustomhead", upload.single("file"), bulkInsertCustomHeadingsController);
detailedestrouter.post("/bulkinsertcustomheadnew", upload.single("file"), bulkInsertCustomHeadingsControllerNew);
detailedestrouter.get("/getgeneralabstract", getGeneralAbstractController);
detailedestrouter.get("/getbillofqty", getBillOfQtyController);
detailedestrouter.post("/addphasebreakdown", addPhaseBreakdownToAbstractController);
detailedestrouter.post("/addphasebreakdowndetailed", addPhaseBreakdownToDetailedController);
detailedestrouter.put("/freeze", freezeDetailedEstimateController);
detailedestrouter.delete("/deleteheading", deleteHeadingController);
detailedestrouter.delete("/deletedatacustomhead", deleteAbstractDataByNametypeController);

export default detailedestrouter;
