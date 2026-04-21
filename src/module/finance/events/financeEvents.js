import { EventEmitter } from "events";
import logger from "../../../config/logger.js";
import { getContext } from "../../../common/requestContext.js";

class FinanceEventEmitter extends EventEmitter {}
export const financeEvents = new FinanceEventEmitter();
financeEvents.setMaxListeners(50);

// Event names
export const FINANCE_EVENTS = Object.freeze({
  BILL_CREATED:       "finance.bill.created",
  BILL_APPROVED:      "finance.bill.approved",
  BILL_CANCELLED:     "finance.bill.cancelled",
  PAYMENT_CREATED:    "finance.payment.created",
  JE_APPROVED:        "finance.je.approved",
  APPROVAL_REQUESTED: "finance.approval.requested",
  APPROVAL_APPROVED:  "finance.approval.approved",
  APPROVAL_REJECTED:  "finance.approval.rejected",
  BULK_IMPORT_DONE:   "finance.bulk.import.completed",
  FY_ARCHIVED:        "finance.fy.archived",
});

// Safe emit — never throws
export const emitFinanceEvent = (event, payload) => {
  try {
    const ctx = getContext();
    financeEvents.emit(event, {
      event,
      payload,
      correlationId: ctx.correlationId,
      actorId:       ctx.userId,
      timestamp:     new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ context: "financeEvents.emit", event, message: err.message });
  }
};

// Default listener: log all events
Object.values(FINANCE_EVENTS).forEach(evt => {
  financeEvents.on(evt, (data) => {
    logger.info({ context: "FinanceEvent", event: data.event, correlationId: data.correlationId });
  });
});
