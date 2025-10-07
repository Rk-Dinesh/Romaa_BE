import { Router } from "express";
import multer from "multer";
import { detailedEstimateCustomHeading, extractHeadingInpairs } from "./detailedestimate.controller.js";

const upload = multer({ storage: multer.memoryStorage() });

const detailedestrouter = Router();

detailedestrouter.post("/addheading", detailedEstimateCustomHeading);
detailedestrouter.get("/extractheadings", extractHeadingInpairs);

export default detailedestrouter;