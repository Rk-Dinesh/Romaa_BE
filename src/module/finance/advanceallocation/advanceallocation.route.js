import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
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

router.get ("/outstanding/paid",     verifyJWT, verifyPermission("finance", "advance_allocation", "read"),   getOutstandingPaid);
router.get ("/outstanding/received", verifyJWT, verifyPermission("finance", "advance_allocation", "read"),   getOutstandingReceived);
router.get ("/summary",              verifyJWT, verifyPermission("finance", "advance_allocation", "read"),   getSummary);

router.post("/allocate",             verifyJWT, verifyPermission("finance", "advance_allocation", "create"), allocate);
router.post("/unallocate",           verifyJWT, verifyPermission("finance", "advance_allocation", "edit"),   unallocate);

router.get ("/voucher/:id",          verifyJWT, verifyPermission("finance", "advance_allocation", "read"),   getVoucherAllocations);
router.get ("/bill/:id",             verifyJWT, verifyPermission("finance", "advance_allocation", "read"),   getBillSettlements);

export default router;
