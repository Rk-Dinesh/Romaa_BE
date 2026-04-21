import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  upsert,
  list,
  getByTender,
  compute,
  computeAll,
  snapshot,
} from "./contractpoc.controller.js";

const router = Router();

router.post("/",                            verifyJWT, upsert);
router.get ("/list",                        verifyJWT, list);
router.get ("/compute-all",                 verifyJWT, computeAll);
router.get ("/:tender_id",                  verifyJWT, getByTender);
router.get ("/:tender_id/compute",          verifyJWT, compute);
router.post("/:tender_id/snapshot",         verifyJWT, snapshot);

export default router;
