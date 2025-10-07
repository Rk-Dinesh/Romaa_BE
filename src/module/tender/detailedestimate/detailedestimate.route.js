import { Router } from "express";
import multer from "multer";
import { bulkInsertCustomHeadingsController, bulkInsertHeadingsController, detailedEstimateCustomHeading, extractHeadingInpairs, getCustomHeadingsByTenderAndNameTypeController, getHeadingsByTenderAndNameTypeController } from "./detailedestimate.controller.js";

const upload = multer({ dest: "uploads/" });

const detailedestrouter = Router();

detailedestrouter.post("/addheading", detailedEstimateCustomHeading);
detailedestrouter.get("/extractheadings", extractHeadingInpairs);
detailedestrouter.get("/getdatacustomhead", getCustomHeadingsByTenderAndNameTypeController);
detailedestrouter.post("/bulkinsertcustomhead", upload.single("file"), bulkInsertCustomHeadingsController);
detailedestrouter.post("/bulkinserthead", upload.single("file"), bulkInsertHeadingsController);
detailedestrouter.get("/getdatahead", getHeadingsByTenderAndNameTypeController);


export default detailedestrouter;