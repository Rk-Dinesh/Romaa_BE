import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  upsert,
  list,
  getByTender,
  compute,
  computeAll,
  snapshot,
} from "./contractpoc.controller.js";

const router = Router();

router.post("/",                            verifyJWT, verifyPermission("finance", "contract_poc", "create"), upsert);
router.get ("/list",                        verifyJWT, verifyPermission("finance", "contract_poc", "read"),   list);
router.get ("/compute-all",                 verifyJWT, verifyPermission("finance", "contract_poc", "read"),   computeAll);
router.get ("/:tender_id",                  verifyJWT, verifyPermission("finance", "contract_poc", "read"),   getByTender);
router.get ("/:tender_id/compute",          verifyJWT, verifyPermission("finance", "contract_poc", "read"),   compute);
router.post("/:tender_id/snapshot",         verifyJWT, verifyPermission("finance", "contract_poc", "edit"),   snapshot);

export default router;
