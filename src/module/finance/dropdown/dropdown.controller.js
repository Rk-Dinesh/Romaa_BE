import DropdownService from "./dropdown.service.js";

// ── GET /finance-dropdown/bank-accounts ───────────────────────────────────────
// Returns all active company bank accounts with their current balance.
// Used in: Payment Voucher "Bank Account" selector, Receipt Voucher source selector.
export const getBankAccounts = async (req, res) => {
  try {
    const { type } = req.query;  // "bank" | "cash" | omit for both
    const data = await DropdownService.getBankAccounts(type || null);
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ── GET /finance-dropdown/bank-only ───────────────────────────────────────────
// Returns only company bank accounts (no cash). Shortcut for ?type=bank.
export const getBankOnly = async (_req, res) => {
  try {
    const data = await DropdownService.getBankAccounts("bank");
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ── GET /finance-dropdown/cash-only ───────────────────────────────────────────
// Returns only company cash accounts (no bank). Shortcut for ?type=cash.
export const getCashOnly = async (_req, res) => {
  try {
    const data = await DropdownService.getBankAccounts("cash");
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ── GET /finance-dropdown/payable-bills ───────────────────────────────────────
// Query params (all optional):
//   supplier_id   — vendor_id or contractor_id
//   supplier_type — "Vendor" | "Contractor"  (omit for both)
//   tender_id     — filter by project
//
// Returns approved, unpaid/partial PurchaseBills + WeeklyBillings combined.
// Used in: Payment Voucher "Bills being settled" table.
export const getPayableBills = async (req, res) => {
  try {
    const { supplier_id, supplier_type, tender_id } = req.query;
    const data = await DropdownService.getPayableBills({
      supplier_id, supplier_type, tender_id,
    });
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ── GET /finance-dropdown/payable-bills/vendor ────────────────────────────────
// Only vendor PurchaseBills (supplier_type=Vendor). Used when payment mode is bank transfer.
// Supports same optional query params: supplier_id, tender_id
export const getVendorPayableBills = async (req, res) => {
  try {
    const { supplier_id, tender_id } = req.query;
    const data = await DropdownService.getPayableBills({
      supplier_id, tender_id, supplier_type: "Vendor",
    });
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ── GET /finance-dropdown/payable-bills/contractor ────────────────────────────
// Only contractor WeeklyBillings (supplier_type=Contractor). Used when payment mode is cash.
// Supports same optional query params: supplier_id, tender_id
export const getContractorPayableBills = async (req, res) => {
  try {
    const { supplier_id, tender_id } = req.query;
    const data = await DropdownService.getPayableBills({
      supplier_id, tender_id, supplier_type: "Contractor",
    });
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ── GET /finance-dropdown/parties/:tenderId ───────────────────────────────────
// Query params (optional):
//   type — "vendor" | "contractor" | "client"  (omit for all three)
//
// Returns vendors / contractors / client linked to the given tender.
// Used in: Payment Voucher, Credit Note, Debit Note "Supplier" selector.
export const getPartiesByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { type }     = req.query;

    if (!tenderId) {
      return res.status(400).json({ status: false, message: "tenderId is required" });
    }

    const validTypes = ["vendor", "contractor", "client"];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        status: false,
        message: `Invalid type '${type}'. Allowed: ${validTypes.join(", ")}`,
      });
    }

    const data = await DropdownService.getPartiesByTender(tenderId, type);
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    const code = error.message.includes("required") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
