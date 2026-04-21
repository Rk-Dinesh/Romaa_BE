import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { sealApproved, verify, status, list, verifyBySequence, getBySequence } from "./ledgerseal.controller.js";

const router = Router();

router.post("/seal-approved", verifyJWT, verifyPermission("finance", "ledger_seal", "create"), sealApproved);
router.get ("/verify",        verifyJWT, verifyPermission("finance", "ledger_seal", "read"),   verify);
// Sequence-range chain-hash walk (no JE content re-check): ?from=1&to=100
router.get ("/verify-seq",    verifyJWT, verifyPermission("finance", "ledger_seal", "read"),   verifyBySequence);
router.get ("/status",        verifyJWT, verifyPermission("finance", "ledger_seal", "read"),   status);
router.get ("/list",          verifyJWT, verifyPermission("finance", "ledger_seal", "read"),   list);
// Must be last to avoid shadowing named routes above
router.get ("/:sequence",     verifyJWT, verifyPermission("finance", "ledger_seal", "read"),   getBySequence);

export default router;
