import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  create, getList, getById, update, approve, archive, remove,
  variance, varianceByTender,
} from "./budget.controller.js";

const router = Router();

router.get   ("/list",                 verifyJWT, getList);
router.post  ("/create",               verifyJWT, create);
router.get   ("/variance/by-tender",   verifyJWT, varianceByTender);
router.get   ("/variance/:id",         verifyJWT, variance);

router.patch ("/update/:id",           verifyJWT, update);
router.patch ("/:id/approve",          verifyJWT, approve);
router.patch ("/:id/archive",          verifyJWT, archive);

router.delete("/:id",                  verifyJWT, remove);
router.get   ("/:id",                  verifyJWT, getById);

export default router;
