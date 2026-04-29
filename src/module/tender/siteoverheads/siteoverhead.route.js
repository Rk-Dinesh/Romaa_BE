import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { getSiteOverhead, updateSiteOverhead } from "./siteoverhead.controller.js";
const siteoverheadrouter = Router();
siteoverheadrouter.use(verifyJWT);

siteoverheadrouter.get("/get/:tender_id", getSiteOverhead);
siteoverheadrouter.put("/update/:tender_id", updateSiteOverhead);

export default siteoverheadrouter;
