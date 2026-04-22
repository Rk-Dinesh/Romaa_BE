import { approvalEvents, APPROVAL_EVENTS } from "../../approval/approval.events.js";
import LeaveRequestModel from "./leaverequest.model.js";
import EmployeeModel from "../employee/employee.model.js";
import UserAttendanceModel from "../userAttendance/userAttendance.model.js";
import CalendarService from "../holidays/holiday.service.js";
import NotificationService from "../../notifications/notification.service.js";
import LeaveBalanceHistoryService from "./leaveBalanceHistory.service.js";
import logger from "../../../config/logger.js";

const SOURCE_TYPE = "LeaveRequest";

// ── Finalize an approved leave ─────────────────────────────────────────────
// Mirrors the effective parts of LeaveService.actionLeave(Approve) without
// its per-actor role gating — the approval engine has already enforced the
// hierarchy, so by the time we land here, all required approvers have signed.
async function finalizeApproval({ source_ref, actor_id }) {
  const leave = await LeaveRequestModel.findById(source_ref);
  if (!leave) return logger.warn(`Leave approval listener: request ${source_ref} not found`);
  if (["HR Approved", "Cancelled", "Rejected"].includes(leave.status)) return;

  const employee = await EmployeeModel.findById(leave.employeeId);
  if (!employee) return logger.warn(`Leave approval listener: employee ${leave.employeeId} not found`);

  const BALANCE_TYPES = ["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement"];
  if (BALANCE_TYPES.includes(leave.leaveType)) {
    const available = employee.leaveBalance?.[leave.leaveType] ?? 0;
    if (available < leave.totalDays) {
      // Reject the leave — balance went negative between apply and approval.
      leave.status          = "Rejected";
      leave.rejectionReason = `Auto-rejected: insufficient ${leave.leaveType} balance at approval time`;
      leave.workflowLogs.push({ action: "Rejected", actionBy: actor_id, role: "System", remarks: leave.rejectionReason });
      await leave.save();
      return;
    }
    employee.leaveBalance[leave.leaveType] -= leave.totalDays;
    await employee.save();
    await LeaveBalanceHistoryService.logDebit({
      employeeId:    leave.employeeId,
      leaveType:     leave.leaveType,
      amount:        leave.totalDays,
      balanceBefore: available,
      leaveRequestId: leave._id,
      performedBy:   actor_id,
      reason: `Leave approved via engine — ${leave.fromDate?.toISOString?.().split("T")[0]} to ${leave.toDate?.toISOString?.().split("T")[0]}`,
    }).catch(() => {});
  }

  // Pre-fill attendance for the approved window.
  try {
    const bulk = [];
    let cursor = new Date(leave.fromDate);
    const end  = new Date(leave.toDate);
    while (cursor <= end) {
      const dayStatus = await CalendarService.checkDayStatus(cursor);
      if (dayStatus.isWorkingDay) {
        bulk.push({
          updateOne: {
            filter: { employeeId: leave.employeeId, date: new Date(cursor) },
            update: { $set: { status: "On Leave", remarks: `Approved Leave: ${leave.leaveType} - ${leave.reason}` } },
            upsert: true,
          },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (bulk.length) await UserAttendanceModel.bulkWrite(bulk);
  } catch (err) {
    logger.warn({ context: "leave.approvalListener.attendance", message: err.message });
  }

  leave.status            = "HR Approved";
  leave.finalApprovedBy   = actor_id;
  leave.finalApprovalDate = new Date();
  leave.workflowLogs.push({ action: "Approved", actionBy: actor_id, role: "Approval Engine", remarks: "Approved via hierarchy" });
  await leave.save();

  NotificationService.notify({
    title: "Leave Approved",
    message: `Your ${leave.leaveType} leave from ${new Date(leave.fromDate).toLocaleDateString("en-GB")} to ${new Date(leave.toDate).toLocaleDateString("en-GB")} has been approved.`,
    audienceType: "user",
    users: [leave.employeeId],
    category: "approval",
    priority: "medium",
    module: "hr",
    reference: { model: "LeaveRequest", documentId: leave._id },
    actionUrl: `/dashboard/profile`,
    actionLabel: "View Leave",
    createdBy: actor_id,
  }).catch(() => {});
}

async function finalizeRejection({ source_ref, actor_id, comment }) {
  const leave = await LeaveRequestModel.findById(source_ref);
  if (!leave) return;
  if (["Rejected", "Cancelled", "HR Approved"].includes(leave.status)) return;

  leave.status          = "Rejected";
  leave.rejectionReason = comment || "Rejected via approval engine";
  leave.workflowLogs.push({ action: "Rejected", actionBy: actor_id, role: "Approval Engine", remarks: comment });
  await leave.save();

  NotificationService.notify({
    title: "Leave Rejected",
    message: `Your ${leave.leaveType} leave request has been rejected.${comment ? " Reason: " + comment : ""}`,
    audienceType: "user",
    users: [leave.employeeId],
    category: "alert",
    priority: "high",
    module: "hr",
    reference: { model: "LeaveRequest", documentId: leave._id },
    actionUrl: `/dashboard/profile`,
    actionLabel: "View Leave",
    createdBy: actor_id,
  }).catch(() => {});
}

let _registered = false;
export function initLeaveApprovalListener() {
  if (_registered) return;
  _registered = true;

  approvalEvents.on(APPROVAL_EVENTS.APPROVED, (evt) => {
    if (evt?.payload?.source_type !== SOURCE_TYPE) return;
    finalizeApproval({ source_ref: evt.payload.source_ref, actor_id: evt.payload.actor_id })
      .catch((err) => logger.error({ context: "leave.approval.approved", message: err.message }));
  });

  approvalEvents.on(APPROVAL_EVENTS.REJECTED, (evt) => {
    if (evt?.payload?.source_type !== SOURCE_TYPE) return;
    finalizeRejection({ source_ref: evt.payload.source_ref, actor_id: evt.payload.actor_id, comment: evt.payload.comment })
      .catch((err) => logger.error({ context: "leave.approval.rejected", message: err.message }));
  });

  logger.info("Leave approval listener registered");
}
