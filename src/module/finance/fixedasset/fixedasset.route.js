import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  create, getList, getById, update, archive,
  postDepreciation, postDepreciationOne, dispose,
  getRegister, getSchedule,
  postItDepreciation, postItDepreciationOne, getDualDepreciationReport,
} from "./fixedasset.controller.js";
import { validate } from "../../../common/validate.js";
import { CreateFixedAssetSchema, UpdateFixedAssetSchema } from "../finance.schemas.js";

const router = Router();

// Register & schedule
router.get ("/register",                  verifyJWT, verifyPermission("finance", "fixed_assets", "read"),   getRegister);
router.post("/post-depreciation",         verifyJWT, verifyPermission("finance", "fixed_assets", "edit"),   postDepreciation);

// IT-Act parallel depreciation (shadow ledger — no JE posted)
router.post("/post-it-depreciation",      verifyJWT, verifyPermission("finance", "fixed_assets", "edit"),   postItDepreciation);
router.get ("/dual-depreciation-report",  verifyJWT, verifyPermission("finance", "fixed_assets", "read"),   getDualDepreciationReport);

router.get ("/list",                      verifyJWT, verifyPermission("finance", "fixed_assets", "read"),   getList);
router.post("/create",                    verifyJWT, verifyPermission("finance", "fixed_assets", "create"), validate(CreateFixedAssetSchema), create);

router.get ("/:id/schedule",              verifyJWT, verifyPermission("finance", "fixed_assets", "read"),   getSchedule);
router.post("/:id/depreciate",            verifyJWT, verifyPermission("finance", "fixed_assets", "edit"),   postDepreciationOne);
router.post("/:id/it-depreciate",         verifyJWT, verifyPermission("finance", "fixed_assets", "edit"),   postItDepreciationOne);
router.post("/:id/dispose",               verifyJWT, verifyPermission("finance", "fixed_assets", "edit"),   dispose);

router.patch ("/update/:id",              verifyJWT, verifyPermission("finance", "fixed_assets", "edit"),   validate(UpdateFixedAssetSchema), update);
router.patch ("/:id/archive",             verifyJWT, verifyPermission("finance", "fixed_assets", "edit"),   archive);

router.get ("/:id",                       verifyJWT, verifyPermission("finance", "fixed_assets", "read"),   getById);

export default router;
