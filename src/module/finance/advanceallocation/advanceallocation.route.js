import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  getOutstandingPaid,
  getOutstandingReceived,
  getSummary,
  allocate,
  unallocate,
  getVoucherAllocations,
  getBillSettlements,
} from "./advanceallocation.controller.js";

const router = Router();

router.get ("/outstanding/paid",     verifyJWT, getOutstandingPaid);
router.get ("/outstanding/received", verifyJWT, getOutstandingReceived);
router.get ("/summary",              verifyJWT, getSummary);

router.post("/allocate",             verifyJWT, allocate);
router.post("/unallocate",           verifyJWT, unallocate);

router.get ("/voucher/:id",          verifyJWT, getVoucherAllocations);
router.get ("/bill/:id",             verifyJWT, getBillSettlements);

export default router;
