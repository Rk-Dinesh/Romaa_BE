import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  calendar, upcoming,
  markFiled, listFilings, unfile,
} from "./statutorydeadline.controller.js";

const router = Router();

router.get ("/calendar",       verifyJWT, calendar);
router.get ("/upcoming",       verifyJWT, upcoming);
router.post("/filings",        verifyJWT, markFiled);
router.get ("/filings",        verifyJWT, listFilings);
router.delete("/filings/:id",  verifyJWT, unfile);

export default router;
