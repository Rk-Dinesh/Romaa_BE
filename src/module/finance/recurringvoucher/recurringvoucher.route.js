import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  create,
  getList,
  getById,
  update,
  pause,
  resume,
  endTemplate,
  remove,
  runNow,
  runDue,
} from "./recurringvoucher.controller.js";

const router = Router();

router.get   ("/list",          verifyJWT, verifyPermission("finance", "recurring_vouchers", "read"),   getList);
router.post  ("/create",        verifyJWT, verifyPermission("finance", "recurring_vouchers", "create"), create);
router.post  ("/run-due",       verifyJWT, verifyPermission("finance", "recurring_vouchers", "edit"),   runDue);    // manual trigger; cron also calls runDue()

router.patch ("/update/:id",    verifyJWT, verifyPermission("finance", "recurring_vouchers", "edit"),   update);
router.patch ("/:id/pause",     verifyJWT, verifyPermission("finance", "recurring_vouchers", "edit"),   pause);
router.patch ("/:id/resume",    verifyJWT, verifyPermission("finance", "recurring_vouchers", "edit"),   resume);
router.patch ("/:id/end",       verifyJWT, verifyPermission("finance", "recurring_vouchers", "edit"),   endTemplate);
router.post  ("/:id/run-now",   verifyJWT, verifyPermission("finance", "recurring_vouchers", "edit"),   runNow);

router.delete("/:id",           verifyJWT, verifyPermission("finance", "recurring_vouchers", "delete"), remove);
router.get   ("/:id",           verifyJWT, verifyPermission("finance", "recurring_vouchers", "read"),   getById);

export default router;
