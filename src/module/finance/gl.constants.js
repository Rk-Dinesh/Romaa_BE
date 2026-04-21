// ── GL Account Code Constants ────────────────────────────────────────────────
// Single source of truth for the "well-known" ledger codes posted to from
// voucher services (purchase bill, credit/debit note, client billing, payment
// voucher, expense voucher, retention, reports).
//
// Values must stay in sync with src/module/finance/accounttree/accounttree.seed.js.
// If you rename a code, change it here — every caller reads from this module.

export const GL = Object.freeze({
  // Assets
  CASH_PETTY:                 "1010",
  BANK_ACCOUNTS_GROUP:        "1020",

  ADV_VENDORS:                "1030-ADV-V",
  ADV_CONTRACTORS:            "1030-ADV-C",
  EMD:                        "1030-EMD",
  SECURITY_DEPOSIT_PAID:      "1030-SD",

  INVENTORY_MATERIAL_AT_SITE: "1040",
  CLIENT_RECEIVABLES_GROUP:   "1050",
  RETENTION_RECEIVABLE:       "1060",  // Dr — retention held by clients
  TDS_RECEIVABLE:             "1070",  // Dr — TDS deducted by clients

  GST_INPUT_CGST:             "1080-CGST",
  GST_INPUT_SGST:             "1080-SGST",
  GST_INPUT_IGST:             "1080-IGST",

  PLANT_MACHINERY:            "1110",

  // Liabilities
  VENDOR_PAYABLES_GROUP:      "2010",
  CONTRACTOR_PAYABLES_GROUP:  "2020",
  CLIENT_ADVANCES_RECEIVED:   "2030",
  RETENTION_PAYABLE:          "2040",  // Cr — retention withheld from contractors
  PAYROLL_PAYABLE:            "2050",
  PF_ESI_PAYABLE:             "2060",

  GST_OUTPUT_CGST:            "2110",
  GST_OUTPUT_SGST:            "2120",
  GST_OUTPUT_IGST:            "2130",
  TDS_PAYABLE:                "2140",
  ITC_REVERSAL:               "2150",
  GST_RCM_CGST:               "2160",
  GST_RCM_SGST:               "2170",
  GST_RCM_IGST:               "2180",

  // Equity
  RETAINED_EARNINGS:          "3020",
  CURRENT_YEAR_PL:            "3030",

  // Income
  PROJECT_REVENUE_GROUP:      "4010",
  EQUIPMENT_HIRE_REVENUE:     "4020",
  PENALTY_INCOME:             "4030",   // recovered via DN against vendor/contractor
  MISC_INCOME:                "4050",   // used for round-off Cr

  // Expenses
  MATERIAL_COST:              "5010",
  SUBCONTRACT_CHARGES:        "5030",   // contractor-specific expense
  SITE_CONTINGENCY:           "5160",   // used for round-off Dr
  OFFICE_RENT:                "5220",
});

// ── Convenience groupings ─────────────────────────────────────────────────────

export const GST_INPUT_CODES  = [GL.GST_INPUT_CGST,  GL.GST_INPUT_SGST,  GL.GST_INPUT_IGST];
export const GST_OUTPUT_CODES = [GL.GST_OUTPUT_CGST, GL.GST_OUTPUT_SGST, GL.GST_OUTPUT_IGST];
export const GST_RCM_CODES    = [GL.GST_RCM_CGST,    GL.GST_RCM_SGST,    GL.GST_RCM_IGST];

// Expense code a Credit/Debit Note reverses against, per supplier_type.
export const expenseCodeForSupplier = (supplier_type) =>
  supplier_type === "Contractor" ? GL.SUBCONTRACT_CHARGES : GL.MATERIAL_COST;

// Per-tender receivable / revenue / cost sub-account helpers.
// Naming convention is established in accounttree.service.js.
export const projectRevenueCode = (tender_id) => `${GL.PROJECT_REVENUE_GROUP}-${tender_id}`;

export default GL;
