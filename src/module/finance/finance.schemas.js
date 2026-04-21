import { z } from "zod";

// ── Reusable primitives ───────────────────────────────────────────────────────

// Accept ISO date strings or native Date objects
const DateLike = z.union([z.string().min(1), z.date()]).optional();

// A positive monetary amount (or zero)
const Amount = z.number().min(0);

// A non-negative percentage
const Pct = z.number().min(0).max(100).default(0);

// Supplier type enum used across multiple vouchers
const SupplierTypeEnum = z.enum(["Vendor", "Contractor", "Client"]);

// Payment mode used in payment / receipt vouchers
const PaymentModeEnum = z.enum(["Cash", "Cheque", "NEFT", "RTGS", "UPI", "DD"]);

// Document status accepted at creation time
const DraftStatus = z.enum(["pending", "draft", "approved"]).default("pending");

// ── Shared sub-schemas ────────────────────────────────────────────────────────

// Journal entry / voucher entry line
const EntryLine = z.object({
  dr_cr:       z.enum(["Dr", "Cr"]),
  account_code: z.string().optional(),
  account_name: z.string().optional(),
  debit_amt:    z.number().min(0).default(0),
  credit_amt:   z.number().min(0).default(0),
});

// Bill reference (used in PaymentVoucher / ReceiptVoucher)
const BillRef = z.object({
  bill_type:   z.enum(["PurchaseBill", "WeeklyBilling", "ClientBilling"]).default("PurchaseBill"),
  bill_ref:    z.string().nullable().optional(),
  bill_no:     z.string().optional().default(""),
  settled_amt: z.number().min(0).default(0),
});

// Additional charge on a PurchaseBill
const AdditionalCharge = z.object({
  type:         z.string().min(1),
  amount:       z.number().min(0).default(0),
  gst_pct:      Pct,
  is_deduction: z.boolean().default(false),
});

// Line item on a PurchaseBill
const PurchaseBillLineItem = z.object({
  grn_no:           z.string().optional().default(""),
  grn_ref:          z.string().nullable().optional(),
  ref_date:         DateLike,
  item_id:          z.string().nullable().optional(),
  item_description: z.string().optional().default(""),
  unit:             z.string().optional().default(""),
  accepted_qty:     z.number().min(0).default(0),
  unit_price:       z.number().min(0).default(0),
  gross_amt:        z.number().min(0).default(0),
  cgst_pct:         Pct,
  sgst_pct:         Pct,
  igst_pct:         Pct,
});

// ── TASK 2 ── Finance Schemas ─────────────────────────────────────────────────

// ── PurchaseBill ──────────────────────────────────────────────────────────────

export const CreatePurchaseBillSchema = z.object({
  vendor_id:          z.string().min(1, "vendor_id is required"),
  invoice_no:         z.string().optional().default(""),
  invoice_date:       DateLike,
  doc_date:           DateLike,
  credit_days:        z.number().int().min(0).default(0),
  narration:          z.string().optional().default(""),
  tender_id:          z.string().optional().default(""),
  tender_ref:         z.string().nullable().optional(),
  tender_name:        z.string().optional().default(""),
  place_of_supply:    z.enum(["InState", "OutState"]).default("InState"),
  line_items:         z.array(PurchaseBillLineItem).default([]),
  additional_charges: z.array(AdditionalCharge).default([]),
  status:             DraftStatus,
  // RCM (Reverse Charge Mechanism): when true, line items must have 0 GST;
  // rcm_amount is computed by the pre-save hook as taxable_value × rcm_rate / 100.
  rcm_applicable:     z.boolean().default(false),
  rcm_rate:           z.number().min(0).max(28).default(18),
});

export const UpdatePurchaseBillSchema = z.object({
  doc_date:           DateLike,
  invoice_no:         z.string().optional(),
  invoice_date:       DateLike,
  credit_days:        z.number().int().min(0).optional(),
  narration:          z.string().optional(),
  line_items:         z.array(PurchaseBillLineItem).optional(),
  additional_charges: z.array(AdditionalCharge).optional(),
  place_of_supply:    z.enum(["InState", "OutState"]).optional(),
  _version:           z.number().int().min(0).optional(),
});

// ── PaymentVoucher ────────────────────────────────────────────────────────────

export const CreatePaymentVoucherSchema = z.object({
  supplier_id:       z.string().min(1, "supplier_id is required"),
  supplier_type:     SupplierTypeEnum,
  pv_date:           DateLike,
  document_year:     z.string().optional(),
  payment_mode:      PaymentModeEnum.default("NEFT"),
  bank_account_code: z.string().optional().default(""),
  bank_name:         z.string().optional().default(""),
  bank_ref:          z.string().optional().default(""),
  cheque_no:         z.string().optional().default(""),
  cheque_date:       DateLike,
  tender_id:         z.string().optional().default(""),
  tender_ref:        z.string().nullable().optional(),
  tender_name:       z.string().optional().default(""),
  bill_refs:         z.array(BillRef).default([]),
  amount:            z.number().min(0, "amount must be >= 0"),
  gross_amount:      z.number().min(0).optional(),
  tds_section:       z.string().optional().default(""),
  tds_pct:           Pct,
  entries:           z.array(EntryLine).default([]),
  narration:         z.string().optional().default(""),
  status:            DraftStatus,
});

export const UpdatePaymentVoucherSchema = z.object({
  pv_date:           DateLike,
  document_year:     z.string().optional(),
  payment_mode:      PaymentModeEnum.optional(),
  bank_account_code: z.string().optional(),
  bank_name:         z.string().optional(),
  bank_ref:          z.string().optional(),
  cheque_no:         z.string().optional(),
  cheque_date:       DateLike,
  bill_refs:         z.array(BillRef).optional(),
  amount:            z.number().min(0).optional(),
  gross_amount:      z.number().min(0).optional(),
  tds_section:       z.string().optional(),
  tds_pct:           Pct.optional(),
  entries:           z.array(EntryLine).optional(),
  narration:         z.string().optional(),
  tender_id:         z.string().optional(),
  tender_ref:        z.string().nullable().optional(),
  tender_name:       z.string().optional(),
  _version:          z.number().int().min(0).optional(),
});

// ── ReceiptVoucher ────────────────────────────────────────────────────────────

export const CreateReceiptVoucherSchema = z.object({
  supplier_id:       z.string().min(1, "supplier_id is required"),
  supplier_type:     SupplierTypeEnum,
  rv_date:           DateLike,
  document_year:     z.string().optional(),
  receipt_mode:      PaymentModeEnum.default("NEFT"),
  bank_account_code: z.string().optional().default(""),
  bank_name:         z.string().optional().default(""),
  bank_ref:          z.string().optional().default(""),
  cheque_no:         z.string().optional().default(""),
  cheque_date:       DateLike,
  tender_id:         z.string().optional().default(""),
  tender_ref:        z.string().nullable().optional(),
  tender_name:       z.string().optional().default(""),
  against_ref:       z.string().nullable().optional(),
  against_no:        z.string().optional().default(""),
  bill_refs:         z.array(BillRef).default([]),
  amount:            z.number().min(0, "amount must be >= 0"),
  entries:           z.array(EntryLine).default([]),
  narration:         z.string().optional().default(""),
  status:            DraftStatus,
});

export const UpdateReceiptVoucherSchema = z.object({
  rv_date:           DateLike,
  document_year:     z.string().optional(),
  receipt_mode:      PaymentModeEnum.optional(),
  bank_account_code: z.string().optional(),
  bank_name:         z.string().optional(),
  bank_ref:          z.string().optional(),
  cheque_no:         z.string().optional(),
  cheque_date:       DateLike,
  against_ref:       z.string().nullable().optional(),
  against_no:        z.string().optional(),
  amount:            z.number().min(0).optional(),
  entries:           z.array(EntryLine).optional(),
  narration:         z.string().optional(),
  tender_id:         z.string().optional(),
  tender_ref:        z.string().nullable().optional(),
  tender_name:       z.string().optional(),
  _version:          z.number().int().min(0).optional(),
});

// ── JournalEntry ──────────────────────────────────────────────────────────────

const JELine = z.object({
  account_code: z.string().min(1, "account_code is required on each line"),
  dr_cr:        z.enum(["Dr", "Cr"]).optional(),
  debit_amt:    z.number().min(0).default(0),
  credit_amt:   z.number().min(0).default(0),
  narration:    z.string().optional().default(""),
  tender_id:    z.string().optional().default(""),
});

export const CreateJournalEntrySchema = z.object({
  je_no:            z.string().min(1, "je_no is required"),
  je_date:          DateLike,
  document_year:    z.string().optional(),
  je_type:          z.string().optional().default("Adjustment"),
  narration:        z.string().min(1, "narration is required"),
  lines:            z.array(JELine).min(2, "At least 2 lines are required"),
  tender_id:        z.string().optional().default(""),
  tender_ref:       z.string().nullable().optional(),
  tender_name:      z.string().optional().default(""),
  is_reversal:      z.boolean().optional().default(false),
  reversal_of:      z.string().nullable().optional(),
  reversal_of_no:   z.string().optional().default(""),
  auto_reverse_date: DateLike,
  status:           DraftStatus,
  allow_closed_fy:  z.boolean().optional().default(false),
});

export const UpdateJournalEntrySchema = z.object({
  je_date:           DateLike,
  document_year:     z.string().optional(),
  je_type:           z.string().optional(),
  narration:         z.string().min(1).optional(),
  lines:             z.array(JELine).min(2).optional(),
  tender_id:         z.string().optional(),
  tender_ref:        z.string().nullable().optional(),
  tender_name:       z.string().optional(),
  auto_reverse_date: DateLike,
  _version:          z.number().int().min(0).optional(),
});

// ── CreditNote ────────────────────────────────────────────────────────────────

export const CreateCreditNoteSchema = z.object({
  supplier_id:    z.string().min(1, "supplier_id is required"),
  supplier_type:  z.enum(["Vendor", "Contractor"]),
  cn_date:        DateLike,
  document_year:  z.string().optional(),
  reference_no:   z.string().optional().default(""),
  reference_date: DateLike,
  location:       z.string().optional().default(""),
  sales_type:     z.enum(["Local", "Interstate"]).default("Local"),
  adj_type:       z.enum(["Against Bill", "Standalone"]).default("Against Bill"),
  tax_type:       z.enum(["GST", "Non-GST"]).default("GST"),
  rev_charge:     z.boolean().default(false),
  bill_ref:       z.string().nullable().optional(),
  bill_no:        z.string().optional().default(""),
  tender_id:      z.string().optional().default(""),
  tender_ref:     z.string().nullable().optional(),
  tender_name:    z.string().optional().default(""),
  amount:         z.number().min(0),
  round_off:      z.number().default(0),
  taxable_amount: z.number().min(0).default(0),
  cgst_pct:       Pct,
  sgst_pct:       Pct,
  igst_pct:       Pct,
  gst_percent:    z.number().min(0).optional(),
  entries:        z.array(EntryLine).default([]),
  narration:      z.string().optional().default(""),
  status:         DraftStatus,
});

export const UpdateCreditNoteSchema = z.object({
  cn_date:        DateLike,
  document_year:  z.string().optional(),
  reference_no:   z.string().optional(),
  reference_date: DateLike,
  location:       z.string().optional(),
  sales_type:     z.enum(["Local", "Interstate"]).optional(),
  adj_type:       z.enum(["Against Bill", "Standalone"]).optional(),
  tax_type:       z.enum(["GST", "Non-GST"]).optional(),
  rev_charge:     z.boolean().optional(),
  bill_ref:       z.string().nullable().optional(),
  bill_no:        z.string().optional(),
  amount:         z.number().min(0).optional(),
  entries:        z.array(EntryLine).optional(),
  narration:      z.string().optional(),
  tender_id:      z.string().optional(),
  tender_ref:     z.string().nullable().optional(),
  tender_name:    z.string().optional(),
  _version:       z.number().int().min(0).optional(),
});

// ── DebitNote ─────────────────────────────────────────────────────────────────

export const CreateDebitNoteSchema = z.object({
  supplier_id:    z.string().min(1, "supplier_id is required"),
  supplier_type:  z.enum(["Vendor", "Contractor"]),
  dn_date:        DateLike,
  document_year:  z.string().optional(),
  reference_no:   z.string().optional().default(""),
  reference_date: DateLike,
  location:       z.string().optional().default(""),
  sales_type:     z.enum(["Local", "Interstate"]).default("Local"),
  adj_type:       z.enum(["Against Bill", "Standalone"]).default("Against Bill"),
  tax_type:       z.enum(["GST", "Non-GST"]).default("GST"),
  rev_charge:     z.boolean().default(false),
  bill_ref:       z.string().nullable().optional(),
  bill_no:        z.string().optional().default(""),
  tender_id:      z.string().optional().default(""),
  tender_ref:     z.string().nullable().optional(),
  tender_name:    z.string().optional().default(""),
  amount:         z.number().min(0),
  service_amt:    z.number().min(0).default(0),
  round_off:      z.number().default(0),
  taxable_amount: z.number().min(0).default(0),
  cgst_pct:       Pct,
  sgst_pct:       Pct,
  igst_pct:       Pct,
  gst_percent:    z.number().min(0).optional(),
  entries:        z.array(EntryLine).default([]),
  narration:      z.string().optional().default(""),
  raised_by:      z.enum(["Company", "Vendor"]).default("Company"),
  status:         DraftStatus,
});

export const UpdateDebitNoteSchema = z.object({
  dn_date:        DateLike,
  document_year:  z.string().optional(),
  reference_no:   z.string().optional(),
  reference_date: DateLike,
  location:       z.string().optional(),
  sales_type:     z.enum(["Local", "Interstate"]).optional(),
  adj_type:       z.enum(["Against Bill", "Standalone"]).optional(),
  tax_type:       z.enum(["GST", "Non-GST"]).optional(),
  rev_charge:     z.boolean().optional(),
  bill_ref:       z.string().nullable().optional(),
  bill_no:        z.string().optional(),
  amount:         z.number().min(0).optional(),
  service_amt:    z.number().min(0).optional(),
  entries:        z.array(EntryLine).optional(),
  narration:      z.string().optional(),
  tender_id:      z.string().optional(),
  tender_ref:     z.string().nullable().optional(),
  tender_name:    z.string().optional(),
  _version:       z.number().int().min(0).optional(),
});

// ── ExpenseVoucher ────────────────────────────────────────────────────────────

const ExpenseLine = z.object({
  expense_account_code: z.string().min(1, "expense_account_code is required"),
  description:          z.string().optional().default(""),
  amount:               z.number().positive("amount must be > 0"),
  gst_pct:              Pct,
  cgst_amt:             z.number().min(0).default(0),
  sgst_amt:             z.number().min(0).default(0),
  igst_amt:             z.number().min(0).default(0),
  tender_id:            z.string().optional().default(""),
  tender_ref:           z.string().nullable().optional(),
  tender_name:          z.string().optional().default(""),
});

export const CreateExpenseVoucherSchema = z.object({
  ev_date:                 DateLike,
  document_year:           z.string().optional(),
  payee_name:              z.string().optional().default(""),
  payee_type:              z.enum(["Employee", "External"]).default("External"),
  employee_id:             z.string().optional().default(""),
  paid_from_account_code:  z.string().optional().default(""),
  paid_from_account_name:  z.string().optional().default(""),
  payment_mode:            z.enum(["Cash", "Cheque", "NEFT", "RTGS", "UPI", "DD"]).default("Cash"),
  reference_no:            z.string().optional().default(""),
  cheque_no:               z.string().optional().default(""),
  cheque_date:             DateLike,
  lines:                   z.array(ExpenseLine).min(1, "At least one expense line is required"),
  tender_id:               z.string().optional().default(""),
  tender_ref:              z.string().nullable().optional(),
  tender_name:             z.string().optional().default(""),
  bill_photo_url:          z.string().optional().default(""),
  bill_no:                 z.string().optional().default(""),
  tds_section:             z.string().optional().default(""),
  tds_pct:                 Pct,
  narration:               z.string().optional().default(""),
  status:                  DraftStatus,
});

export const UpdateExpenseVoucherSchema = z.object({
  ev_date:                 DateLike,
  document_year:           z.string().optional(),
  payee_name:              z.string().optional(),
  payee_type:              z.enum(["Employee", "External"]).optional(),
  employee_id:             z.string().optional(),
  paid_from_account_code:  z.string().optional(),
  paid_from_account_name:  z.string().optional(),
  payment_mode:            z.enum(["Cash", "Cheque", "NEFT", "RTGS", "UPI", "DD"]).optional(),
  reference_no:            z.string().optional(),
  cheque_no:               z.string().optional(),
  cheque_date:             DateLike,
  lines:                   z.array(ExpenseLine).min(1).optional(),
  bill_photo_url:          z.string().optional(),
  bill_no:                 z.string().optional(),
  tds_section:             z.string().optional(),
  tds_pct:                 Pct.optional(),
  narration:               z.string().optional(),
  _version:                z.number().int().min(0).optional(),
});

// ── BankTransfer ──────────────────────────────────────────────────────────────

export const CreateBankTransferSchema = z.object({
  transfer_no:       z.string().min(1, "transfer_no is required"),
  transfer_date:     DateLike,
  document_year:     z.string().optional(),
  from_account_code: z.string().min(1, "from_account_code is required"),
  from_account_name: z.string().optional(),
  to_account_code:   z.string().min(1, "to_account_code is required"),
  to_account_name:   z.string().optional(),
  amount:            z.number().positive("amount must be > 0"),
  transfer_mode:     PaymentModeEnum.default("NEFT"),
  reference_no:      z.string().optional().default(""),
  cheque_no:         z.string().optional().default(""),
  cheque_date:       DateLike,
  tender_id:         z.string().optional().default(""),
  tender_name:       z.string().optional().default(""),
  narration:         z.string().optional().default(""),
  status:            DraftStatus,
});

export const UpdateBankTransferSchema = z.object({
  transfer_date:     DateLike,
  document_year:     z.string().optional(),
  from_account_code: z.string().optional(),
  from_account_name: z.string().optional(),
  to_account_code:   z.string().optional(),
  to_account_name:   z.string().optional(),
  amount:            z.number().positive().optional(),
  transfer_mode:     PaymentModeEnum.optional(),
  reference_no:      z.string().optional(),
  cheque_no:         z.string().optional(),
  cheque_date:       DateLike,
  tender_id:         z.string().optional(),
  tender_name:       z.string().optional(),
  narration:         z.string().optional(),
  _version:          z.number().int().min(0).optional(),
});

// ── ClientBilling (CSV upload has its own flow — body validation on JSON endpoints) ──

export const ApproveBillSchema = z.object({
  // approve endpoint has no significant body beyond optional meta
}).passthrough();

// ── Budget ────────────────────────────────────────────────────────────────────

const BudgetLine = z.object({
  account_code:  z.string().min(1, "account_code is required on each budget line"),
  account_name:  z.string().optional(),
  account_type:  z.string().optional(),
  period:        z.enum(["annual", "quarterly", "monthly"]),
  period_label:  z.string().optional(),
  budget_amount: z.number().min(0),
  notes:         z.string().optional().default(""),
});

export const CreateBudgetSchema = z.object({
  tender_id:      z.string().min(1, "tender_id is required"),
  financial_year: z.string().min(1, "financial_year is required"),
  lines:          z.array(BudgetLine).min(1, "At least one budget line is required"),
  narration:      z.string().optional().default(""),
  created_by:     z.string().optional().default(""),
});

export const UpdateBudgetSchema = z.object({
  lines:     z.array(BudgetLine).min(1).optional(),
  narration: z.string().optional(),
  _version:  z.number().int().min(0).optional(),
});

// ── FixedAsset ────────────────────────────────────────────────────────────────

export const CreateFixedAssetSchema = z.object({
  asset_name:    z.string().min(1, "asset_name is required"),
  category:      z.enum([
    "Plant & Machinery",
    "Furniture & Fixtures",
    "Vehicles",
    "Buildings",
    "Office Equipment",
    "Computers & IT",
    "Land",
    "Other",
  ]).default("Plant & Machinery"),
  acquisition_date: z.union([z.string().min(1), z.date()]),
  acquisition_cost: z.number().positive("acquisition_cost must be > 0"),
  salvage_value:    z.number().min(0).default(0),
  depreciation_method: z.enum(["SLM", "WDV"]).default("SLM"),
  useful_life_months:  z.number().int().min(0).default(0),
  wdv_rate_pct:        z.number().min(0).max(100).default(0),
  asset_account_code:                    z.string().min(1, "asset_account_code is required"),
  accumulated_depreciation_account_code: z.string().min(1, "accumulated_depreciation_account_code is required"),
  depreciation_expense_account_code:     z.string().min(1, "depreciation_expense_account_code is required"),
  tender_id:   z.string().optional().default(""),
  tender_ref:  z.string().nullable().optional(),
  tender_name: z.string().optional().default(""),
  linked_machinery_id:  z.string().optional().default(""),
  linked_machinery_ref: z.string().nullable().optional(),
  it_block:     z.string().optional(),
  it_rate_pct:  z.number().min(0).max(100).default(15),
  it_acquired_in_year_half: z.boolean().optional(),
  narration:    z.string().optional().default(""),
  created_by:   z.string().optional().default(""),
});

export const UpdateFixedAssetSchema = z.object({
  asset_name:          z.string().min(1).optional(),
  category:            z.string().optional(),
  linked_machinery_id: z.string().optional(),
  linked_machinery_ref: z.string().nullable().optional(),
  tender_id:           z.string().optional(),
  tender_ref:          z.string().nullable().optional(),
  tender_name:         z.string().optional(),
  narration:           z.string().optional(),
  _version:            z.number().int().min(0).optional(),
});
