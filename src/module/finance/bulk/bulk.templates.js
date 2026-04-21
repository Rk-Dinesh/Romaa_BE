// Each template: { headers: string[], sampleRow: object, notes: string[] }
export const TEMPLATES = {
  purchasebill: {
    headers: [
      "vendor_id", "invoice_no", "invoice_date", "bill_date", "due_date",
      "tax_mode", "cgst_pct", "sgst_pct", "igst_pct",
      "currency", "exchange_rate",
      "tds_applicable", "tds_section", "tds_rate",
      "tender_id", "fin_year",
      "item_description", "item_qty", "item_unit", "item_rate", "item_hsn",
    ],
    notes: [
      "One row per line item. Repeat bill header fields for each item of the same invoice.",
      "invoice_no must be unique per vendor.",
      "tax_mode: 'instate' or 'otherstate'",
      "tds_applicable: yes/no",
      "currency: ISO code e.g. INR, USD (default INR)",
    ],
    sampleRow: {
      vendor_id: "VND-001", invoice_no: "INV-2025-001", invoice_date: "2025-04-01",
      bill_date: "2025-04-02", due_date: "2025-04-30",
      tax_mode: "instate", cgst_pct: 9, sgst_pct: 9, igst_pct: 0,
      currency: "INR", exchange_rate: 1,
      tds_applicable: "no", tds_section: "", tds_rate: 0,
      tender_id: "TND-001", fin_year: "25-26",
      item_description: "Cement 50kg", item_qty: 100, item_unit: "Bags",
      item_rate: 450, item_hsn: "25232100",
    },
  },

  paymentvoucher: {
    headers: [
      "supplier_id", "supplier_type", "pv_date", "payment_mode", "bank_ref",
      "amount", "narration", "bill_no", "currency", "exchange_rate",
      "tender_id", "fin_year",
    ],
    notes: [
      "One row per payment. bill_no is optional (links payment to a bill).",
      "payment_mode: Cheque/NEFT/RTGS/UPI/DD/Cash",
      "supplier_type: Vendor, Contractor, or Client",
    ],
    sampleRow: {
      supplier_id: "VND-001", supplier_type: "Vendor", pv_date: "2025-04-01",
      payment_mode: "NEFT", bank_ref: "TXN123", amount: 50000,
      narration: "Payment for INV-001", bill_no: "", currency: "INR",
      exchange_rate: 1, tender_id: "TND-001", fin_year: "25-26",
    },
  },

  receiptvoucher: {
    headers: [
      "supplier_id", "supplier_type", "rv_date", "receipt_mode", "bank_ref",
      "amount", "narration", "bill_no", "currency", "exchange_rate",
      "tender_id", "fin_year",
    ],
    notes: [
      "One row per receipt. bill_no is optional.",
      "supplier_type: Vendor, Contractor, or Client",
      "receipt_mode: Cheque/NEFT/RTGS/UPI/DD/Cash",
    ],
    sampleRow: {
      supplier_id: "CLT-001", supplier_type: "Client", rv_date: "2025-04-01",
      receipt_mode: "NEFT", bank_ref: "TXN456", amount: 200000,
      narration: "Receipt against Bill", bill_no: "", currency: "INR",
      exchange_rate: 1, tender_id: "TND-001", fin_year: "25-26",
    },
  },

  journalentry: {
    headers: [
      "je_no", "je_date", "narration", "account_code", "entry_type",
      "debit_amt", "credit_amt", "cost_center", "currency", "exchange_rate",
      "tender_id", "fin_year",
    ],
    notes: [
      "One row per JE line. Rows with the same je_no are grouped into one JE.",
      "entry_type: Dr or Cr",
      "Set debit_amt for Dr lines, credit_amt for Cr lines (leave the other as 0).",
      "Total Dr must equal Total Cr within each JE group.",
      "je_no is required — use the same value for all lines of one entry.",
    ],
    sampleRow: {
      je_no: "JE-001", je_date: "2025-04-01", narration: "Salary April",
      account_code: "SAL-001", entry_type: "Dr", debit_amt: 50000, credit_amt: 0,
      cost_center: "HO", currency: "INR", exchange_rate: 1,
      tender_id: "TND-001", fin_year: "25-26",
    },
  },

  expensevoucher: {
    headers: [
      "ev_date", "expense_account_code", "description", "amount",
      "employee_id", "payment_mode", "bill_no", "currency", "exchange_rate",
      "tender_id", "fin_year",
    ],
    notes: [
      "One row per expense line.",
      "payment_mode: Cash/NEFT/Cheque/UPI/Card",
      "expense_account_code must be a valid Expense leaf account in the Chart of Accounts.",
    ],
    sampleRow: {
      ev_date: "2025-04-01", expense_account_code: "EXP-TRAVEL",
      description: "Site visit auto fare", amount: 500,
      employee_id: "EMP-001", payment_mode: "Cash", bill_no: "",
      currency: "INR", exchange_rate: 1, tender_id: "TND-001", fin_year: "25-26",
    },
  },

  creditnote: {
    headers: [
      "supplier_id", "supplier_type", "cn_date", "against_bill_no", "amount",
      "reason", "tax_mode", "cgst_pct", "sgst_pct", "igst_pct",
      "currency", "exchange_rate", "tender_id", "fin_year",
    ],
    notes: [
      "One row per credit note.",
      "supplier_type: Vendor or Contractor",
      "against_bill_no links CN to an existing purchase bill doc_id.",
    ],
    sampleRow: {
      supplier_id: "VND-001", supplier_type: "Vendor", cn_date: "2025-04-10",
      against_bill_no: "PB/25-26/0001", amount: 5000, reason: "Quality deduction",
      tax_mode: "instate", cgst_pct: 9, sgst_pct: 9, igst_pct: 0,
      currency: "INR", exchange_rate: 1, tender_id: "TND-001", fin_year: "25-26",
    },
  },

  debitnote: {
    headers: [
      "supplier_id", "supplier_type", "dn_date", "against_bill_no", "amount",
      "reason", "raised_by", "tax_mode", "cgst_pct", "sgst_pct", "igst_pct",
      "currency", "exchange_rate", "tender_id", "fin_year",
    ],
    notes: [
      "One row per debit note.",
      "supplier_type: Vendor or Contractor",
      "raised_by: Company (default) or Vendor",
      "against_bill_no links DN to an existing purchase bill doc_id.",
    ],
    sampleRow: {
      supplier_id: "VND-001", supplier_type: "Vendor", dn_date: "2025-04-10",
      against_bill_no: "PB/25-26/0001", amount: 3000, reason: "Price revision",
      raised_by: "Company", tax_mode: "instate", cgst_pct: 9, sgst_pct: 9, igst_pct: 0,
      currency: "INR", exchange_rate: 1, tender_id: "TND-001", fin_year: "25-26",
    },
  },
};
