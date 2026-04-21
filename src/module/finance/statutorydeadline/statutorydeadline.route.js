import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  calendar, upcoming,
  markFiled, listFilings, unfile,
} from "./statutorydeadline.controller.js";

const router = Router();

router.get ("/calendar",       verifyJWT, verifyPermission("finance", "statutory_deadline", "read"),   calendar);
router.get ("/upcoming",       verifyJWT, verifyPermission("finance", "statutory_deadline", "read"),   upcoming);
router.post("/filings",        verifyJWT, verifyPermission("finance", "statutory_deadline", "create"), markFiled);
router.get ("/filings",        verifyJWT, verifyPermission("finance", "statutory_deadline", "read"),   listFilings);
router.delete("/filings/:id",  verifyJWT, verifyPermission("finance", "statutory_deadline", "delete"), unfile);

export default router;
