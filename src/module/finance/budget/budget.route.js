import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  create, getList, getById, update, approve, archive, remove,
  variance, varianceByTender,
} from "./budget.controller.js";
import { validate } from "../../../common/validate.js";
import { CreateBudgetSchema, UpdateBudgetSchema } from "../finance.schemas.js";

const router = Router();

router.get   ("/list",                 verifyJWT, verifyPermission("finance", "budgets", "read"),   getList);
router.post  ("/create",               verifyJWT, verifyPermission("finance", "budgets", "create"), validate(CreateBudgetSchema), create);
router.get   ("/variance/by-tender",   verifyJWT, verifyPermission("finance", "budgets", "read"),   varianceByTender);
router.get   ("/variance/:id",         verifyJWT, verifyPermission("finance", "budgets", "read"),   variance);

router.patch ("/update/:id",           verifyJWT, verifyPermission("finance", "budgets", "edit"),   validate(UpdateBudgetSchema), update);
router.patch ("/:id/approve",          verifyJWT, verifyPermission("finance", "budgets", "edit"),   approve);
router.patch ("/:id/archive",          verifyJWT, verifyPermission("finance", "budgets", "edit"),   archive);

router.delete("/:id",                  verifyJWT, verifyPermission("finance", "budgets", "delete"), remove);
router.get   ("/:id",                  verifyJWT, verifyPermission("finance", "budgets", "read"),   getById);

export default router;
