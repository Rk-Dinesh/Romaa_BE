import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  create, getList, getById, update, archive,
  postDepreciation, postDepreciationOne, dispose,
  getRegister, getSchedule,
  postItDepreciation, postItDepreciationOne, getDualDepreciationReport,
} from "./fixedasset.controller.js";

const router = Router();

// Register & schedule
router.get ("/register",                  verifyJWT, getRegister);
router.post("/post-depreciation",         verifyJWT, postDepreciation);

// IT-Act parallel depreciation (shadow ledger — no JE posted)
router.post("/post-it-depreciation",      verifyJWT, postItDepreciation);
router.get ("/dual-depreciation-report",  verifyJWT, getDualDepreciationReport);

router.get ("/list",                      verifyJWT, getList);
router.post("/create",                    verifyJWT, create);

router.get ("/:id/schedule",              verifyJWT, getSchedule);
router.post("/:id/depreciate",            verifyJWT, postDepreciationOne);
router.post("/:id/it-depreciate",         verifyJWT, postItDepreciationOne);
router.post("/:id/dispose",               verifyJWT, dispose);

router.patch ("/update/:id",              verifyJWT, update);
router.patch ("/:id/archive",             verifyJWT, archive);

router.get ("/:id",                       verifyJWT, getById);

export default router;
