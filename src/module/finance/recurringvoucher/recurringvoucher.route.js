import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
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

router.get   ("/list",          verifyJWT, getList);
router.post  ("/create",        verifyJWT, create);
router.post  ("/run-due",       verifyJWT, runDue);    // manual trigger; cron also calls runDue()

router.patch ("/update/:id",    verifyJWT, update);
router.patch ("/:id/pause",     verifyJWT, pause);
router.patch ("/:id/resume",    verifyJWT, resume);
router.patch ("/:id/end",       verifyJWT, endTemplate);
router.post  ("/:id/run-now",   verifyJWT, runNow);

router.delete("/:id",           verifyJWT, remove);
router.get   ("/:id",           verifyJWT, getById);

export default router;
