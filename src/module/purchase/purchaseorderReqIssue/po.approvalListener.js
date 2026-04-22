import { approvalEvents, APPROVAL_EVENTS } from "../../approval/approval.events.js";
import PurchaseRequestModel from "./purchaseReqIssue.model.js";
import NotificationService from "../../notifications/notification.service.js";
import logger from "../../../config/logger.js";

const SOURCE_TYPE = "PurchaseOrder";

// When the approval engine finalises a PO, we don't revert quotation-level
// decisions (those are already irrevocable). We reflect the engine's verdict
// on `purchaseOrder.progressStatus` and notify stakeholders.

async function onApproved({ source_ref, actor_id }) {
  const pr = await PurchaseRequestModel.findById(source_ref);
  if (!pr) return;
  if (pr.purchaseOrder?.progressStatus === "Completed") return;

  pr.purchaseOrder = pr.purchaseOrder || {};
  if (pr.purchaseOrder.progressStatus === "On Hold" || !pr.purchaseOrder.progressStatus) {
    pr.purchaseOrder.progressStatus = "In Progress";
  }
  pr.purchaseOrder.remarks = [pr.purchaseOrder.remarks, `Approved via engine on ${new Date().toISOString()}`]
    .filter(Boolean).join(" | ");
  await pr.save();

  NotificationService.notify({
    title: "Purchase Order Approved",
    message: `PO ${pr.requestId} (₹${pr.purchaseOrder?.approvedAmount?.toLocaleString?.("en-IN") ?? pr.purchaseOrder?.approvedAmount ?? 0}) has cleared the approval hierarchy.`,
    audienceType: "user",
    users: [pr.createdBy].filter(Boolean),
    category: "approval",
    priority: "medium",
    module: "purchase",
    reference: { model: "PurchaseRequest", documentId: pr._id },
    createdBy: actor_id,
  }).catch(() => {});
}

async function onRejected({ source_ref, actor_id, comment }) {
  const pr = await PurchaseRequestModel.findById(source_ref);
  if (!pr) return;
  pr.purchaseOrder = pr.purchaseOrder || {};
  pr.purchaseOrder.progressStatus = "On Hold";
  pr.purchaseOrder.remarks = [pr.purchaseOrder.remarks, `Rejected by approver: ${comment || "No reason"}`]
    .filter(Boolean).join(" | ");
  await pr.save();

  NotificationService.notify({
    title: "Purchase Order Rejected",
    message: `PO ${pr.requestId} was rejected. ${comment || ""}`.trim(),
    audienceType: "user",
    users: [pr.createdBy].filter(Boolean),
    category: "alert",
    priority: "high",
    module: "purchase",
    reference: { model: "PurchaseRequest", documentId: pr._id },
    createdBy: actor_id,
  }).catch(() => {});
}

let _registered = false;
export function initPurchaseOrderApprovalListener() {
  if (_registered) return;
  _registered = true;

  approvalEvents.on(APPROVAL_EVENTS.APPROVED, (evt) => {
    if (evt?.payload?.source_type !== SOURCE_TYPE) return;
    onApproved({ source_ref: evt.payload.source_ref, actor_id: evt.payload.actor_id })
      .catch((err) => logger.error({ context: "po.approval.approved", message: err.message }));
  });

  approvalEvents.on(APPROVAL_EVENTS.REJECTED, (evt) => {
    if (evt?.payload?.source_type !== SOURCE_TYPE) return;
    onRejected({ source_ref: evt.payload.source_ref, actor_id: evt.payload.actor_id, comment: evt.payload.comment })
      .catch((err) => logger.error({ context: "po.approval.rejected", message: err.message }));
  });

  logger.info("Purchase Order approval listener registered");
}
