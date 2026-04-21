export const BILL_STATUS = Object.freeze({
  DRAFT:    "draft",
  PENDING:  "pending",
  APPROVED: "approved",
  CANCELLED:"cancelled",
});

export const APPROVAL_STATUS = Object.freeze({
  PENDING:  "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export const TAX_MODE = Object.freeze({
  INSTATE:    "instate",
  OTHERSTATE: "otherstate",
});

export const PAYMENT_MODE = Object.freeze({
  BANK:   "bank",
  CASH:   "cash",
  UPI:    "upi",
  CHEQUE: "cheque",
  NEFT:   "neft",
  RTGS:   "rtgs",
  IMPS:   "imps",
});

export const ENTRY_TYPE = Object.freeze({ DR: "Dr", CR: "Cr" });

export const SUPPLIER_TYPE = Object.freeze({ VENDOR: "vendor", CONTRACTOR: "contractor" });

export const PAID_STATUS = Object.freeze({ UNPAID: "unpaid", PARTIAL: "partial", PAID: "paid" });

export const VOUCHER_SOURCE = Object.freeze({
  PURCHASE_BILL:     "PurchaseBill",
  PAYMENT_VOUCHER:   "PaymentVoucher",
  RECEIPT_VOUCHER:   "ReceiptVoucher",
  CREDIT_NOTE:       "CreditNote",
  DEBIT_NOTE:        "DebitNote",
  EXPENSE_VOUCHER:   "ExpenseVoucher",
  BANK_TRANSFER:     "BankTransfer",
  JOURNAL_ENTRY:     "JournalEntry",
  CLIENT_BILLING:    "ClientBilling",
  WEEKLY_BILLING:    "WeeklyBilling",
});

export const TDS_SECTION = Object.freeze({
  S194C: "194C", // Contractor payments
  S194J: "194J", // Professional/Technical services
  S194I: "194I", // Rent
  S194Q: "194Q", // Purchase of goods
  S194H: "194H", // Commission/Brokerage
});

export const AUDIT_ACTION = Object.freeze({
  CREATE:  "create",
  UPDATE:  "update",
  APPROVE: "approve",
  REJECT:  "reject",
  DELETE:  "delete",
  IMPORT:  "import",
  EXPORT:  "export",
  REVERSE: "reverse",
  CANCEL:  "cancel",
});
