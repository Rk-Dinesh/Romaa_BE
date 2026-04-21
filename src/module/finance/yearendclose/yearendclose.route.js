import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { preview, closeFY, reopen, list, getOne, openingBalances } from "./yearendclose.controller.js";

const router = Router();

router.get ("/preview",              verifyJWT, verifyPermission("finance", "year_end_close", "read"),   preview);
router.get ("/opening-balances",     verifyJWT, verifyPermission("finance", "year_end_close", "read"),   openingBalances);
router.get ("/list",                 verifyJWT, verifyPermission("finance", "year_end_close", "read"),   list);
router.post("/close",                verifyJWT, verifyPermission("finance", "year_end_close", "create"), closeFY);
router.post("/reopen",               verifyJWT, verifyPermission("finance", "year_end_close", "edit"),   reopen);
router.get ("/:financial_year",      verifyJWT, verifyPermission("finance", "year_end_close", "read"),   getOne);

export default router;
