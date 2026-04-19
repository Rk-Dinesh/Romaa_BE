import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  create, getList, getById, update, archive,
  postDepreciation, postDepreciationOne, dispose,
  getRegister, getSchedule,
} from "./fixedasset.controller.js";

const router = Router();

// Register & schedule
router.get ("/register",            verifyJWT, getRegister);
router.post("/post-depreciation",   verifyJWT, postDepreciation);

router.get ("/list",                verifyJWT, getList);
router.post("/create",              verifyJWT, create);

router.get ("/:id/schedule",        verifyJWT, getSchedule);
router.post("/:id/depreciate",      verifyJWT, postDepreciationOne);
router.post("/:id/dispose",         verifyJWT, dispose);

router.patch ("/update/:id",        verifyJWT, update);
router.patch ("/:id/archive",       verifyJWT, archive);

router.get ("/:id",                 verifyJWT, getById);

export default router;
