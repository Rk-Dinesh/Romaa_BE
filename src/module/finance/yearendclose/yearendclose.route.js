import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { preview, closeFY, reopen, list, getOne, openingBalances } from "./yearendclose.controller.js";

const router = Router();

router.get ("/preview",              verifyJWT, preview);
router.get ("/opening-balances",     verifyJWT, openingBalances);
router.get ("/list",                 verifyJWT, list);
router.post("/close",                verifyJWT, closeFY);
router.post("/reopen",               verifyJWT, reopen);
router.get ("/:financial_year",      verifyJWT, getOne);

export default router;
