// Lightweight in-memory finance metrics counter store.
// No external dependencies — just Maps. Resets on process restart.
// Designed for operational dashboards and alerting, not long-term analytics.

const counters = new Map();

/** Increment a named counter by `by` (default 1). */
export const increment = (key, by = 1) =>
  counters.set(key, (counters.get(key) || 0) + by);

/** Return a plain object snapshot of all counters. */
export const getAll = () => Object.fromEntries(counters);

/** Reset all counters (useful in tests). */
export const reset = () => counters.clear();

export const METRIC_KEYS = {
  BILLS_CREATED:      "finance.bills.created",
  BILLS_APPROVED:     "finance.bills.approved",
  PAYMENTS_POSTED:    "finance.payments.posted",
  JE_APPROVED:        "finance.je.approved",
  APPROVAL_INITIATED: "finance.approval.initiated",
  BULK_IMPORT_ROWS:   "finance.bulk.import.rows",
  BULK_EXPORT_ROWS:   "finance.bulk.export.rows",
  WEBHOOK_DELIVERED:  "finance.webhook.delivered",
  WEBHOOK_FAILED:     "finance.webhook.failed",
  IDEMPOTENCY_HIT:    "finance.idempotency.hit",
};
