// Canonical error code constants — used in AppError and API responses.
// The error_code field lets frontends/clients react programmatically without
// parsing message strings.

export const ERROR_CODES = {
  // Generic
  INTERNAL_ERROR:          "INTERNAL_ERROR",
  NOT_FOUND:               "NOT_FOUND",
  VALIDATION_FAILED:       "VALIDATION_FAILED",
  DUPLICATE_ENTRY:         "DUPLICATE_ENTRY",
  INSUFFICIENT_PERMISSION: "INSUFFICIENT_PERMISSION",
  RATE_LIMIT_EXCEEDED:     "RATE_LIMIT_EXCEEDED",

  // Workflow / state-machine
  INVALID_TRANSITION:      "INVALID_TRANSITION",
  APPROVAL_REQUIRED:       "APPROVAL_REQUIRED",
  IDEMPOTENCY_CONFLICT:    "IDEMPOTENCY_CONFLICT",

  // Finance-specific
  BALANCE_MISMATCH:        "BALANCE_MISMATCH",
  RCM_GST_CONFLICT:        "RCM_GST_CONFLICT",
  CURRENCY_NOT_FOUND:      "CURRENCY_NOT_FOUND",
  EXCHANGE_RATE_MISSING:   "EXCHANGE_RATE_MISSING",
  BULK_IMPORT_FAILED:      "BULK_IMPORT_FAILED",
  LEDGER_SEAL_BROKEN:      "LEDGER_SEAL_BROKEN",
};
