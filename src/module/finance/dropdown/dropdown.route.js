import { Router } from "express";
import {
  getBankAccounts,
  getBankOnly,
  getCashOnly,
  getPayableBills,
  getVendorPayableBills,
  getContractorPayableBills,
  getPartiesByTender,
} from "./dropdown.controller.js";
import { verifyJWT } from "../../../common/Auth.middlware.js";

// ─────────────────────────────────────────────────────────────────────────────
//  GET  /finance-dropdown/bank-accounts
//       All active company bank accounts with current balance.
//       Used for the "Bank / Payment Account" selector on Payment Voucher.
//
//  GET  /finance-dropdown/payable-bills
//       ?supplier_id=VND-001
//       &supplier_type=Vendor              (Vendor | Contractor — omit for both)
//       &tender_id=TND-001
//       Approved unpaid/partial PurchaseBills + WeeklyBillings combined.
//       Used for "Bills being settled" table on Payment Voucher.
//
//  GET  /finance-dropdown/parties/:tenderId
//       ?type=vendor|contractor|client     (omit for all three)
//       Vendors, contractors, and client linked to a tender.
//       Used for the "Supplier" selector on PV, Credit Note, Debit Note.
// ─────────────────────────────────────────────────────────────────────────────

const dropdownRouter = Router();

dropdownRouter.get(
  "/bank-accounts",
  verifyJWT,
  getBankAccounts
);

dropdownRouter.get(
  "/bank-only",
  verifyJWT,
  getBankOnly
);

dropdownRouter.get(
  "/cash-only",
  verifyJWT,
  getCashOnly
);

dropdownRouter.get(
  "/payable-bills",
  verifyJWT,
  getPayableBills
);

// Dedicated: vendor bills only (for bank payment)
dropdownRouter.get(
  "/payable-bills/vendor",
  verifyJWT,
  getVendorPayableBills
);

// Dedicated: contractor bills only (for cash payment)
dropdownRouter.get(
  "/payable-bills/contractor",
  verifyJWT,
  getContractorPayableBills
);

dropdownRouter.get(
  "/parties/:tenderId",
  verifyJWT,
  getPartiesByTender
);

export default dropdownRouter;
