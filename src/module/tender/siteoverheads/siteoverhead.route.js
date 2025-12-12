import { Router } from "express";
import { getSiteOverhead, updateSiteOverhead } from "./siteoverhead.controller.js";
const siteoverheadrouter = Router();

siteoverheadrouter.get("/get/:tender_id", getSiteOverhead);
siteoverheadrouter.put("/update/:tender_id", updateSiteOverhead);

export default siteoverheadrouter;
