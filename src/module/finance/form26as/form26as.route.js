import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { upload, list, reconcile, remove } from "./form26as.controller.js";

const router = Router();

router.post  ("/upload",    verifyJWT, upload);
router.get   ("/list",      verifyJWT, list);
router.get   ("/reconcile", verifyJWT, reconcile);
router.delete("/:id",       verifyJWT, remove);

export default router;
