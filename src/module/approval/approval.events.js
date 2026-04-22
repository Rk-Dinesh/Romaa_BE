import { EventEmitter } from "events";
import logger from "../../config/logger.js";
import { getContext } from "../../common/requestContext.js";

// ── Approval Event Bus ──────────────────────────────────────────────────────
//
// Module-agnostic pub/sub for approval lifecycle. Downstream services (leave,
// purchase order, payment voucher, etc.) subscribe to APPROVED / REJECTED and
// flip their own state when their `source_type` matches.
//
// This bus is intentionally separate from financeEvents so that non-finance
// modules (HR, project, purchase) don't have to depend on the finance module.
// Finance listeners are still registered on financeEvents directly for
// backward compatibility.

class ApprovalEventEmitter extends EventEmitter {}
export const approvalEvents = new ApprovalEventEmitter();
approvalEvents.setMaxListeners(100);

export const APPROVAL_EVENTS = Object.freeze({
  REQUESTED: "approval.requested",
  APPROVED:  "approval.approved",
  REJECTED:  "approval.rejected",
  WITHDRAWN: "approval.withdrawn",
  ESCALATED: "approval.escalated",
});

export const emitApprovalEvent = (event, payload) => {
  try {
    const ctx = getContext();
    approvalEvents.emit(event, {
      event,
      payload,
      correlationId: ctx.correlationId,
      actorId:       ctx.userId,
      timestamp:     new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ context: "approvalEvents.emit", event, message: err.message });
  }
};
