import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { upload, list, reconcile, remove } from "./form26as.controller.js";

const router = Router();

router.post  ("/upload",    verifyJWT, verifyPermission("finance", "form_26as", "create"), upload);
router.get   ("/list",      verifyJWT, verifyPermission("finance", "form_26as", "read"),   list);
router.get   ("/reconcile", verifyJWT, verifyPermission("finance", "form_26as", "read"),   reconcile);
router.delete("/:id",       verifyJWT, verifyPermission("finance", "form_26as", "delete"), remove);

export default router;
