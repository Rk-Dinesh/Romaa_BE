import cron from "node-cron";
import LeaveRequestModel from "../src/module/hr/leave/leaverequest.model.js";
import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import LeavePolicyService from "../src/module/hr/leavePolicy/leavePolicy.service.js";
import NotificationService from "../src/module/notifications/notification.service.js";
import { runAsSystem } from "../src/common/requestContext.js";
import logger from "../src/config/logger.js";

const FALLBACK_SLA_HRS    = 48;
const REMINDER_AFTER_HRS  = 12;

// A4-a: Reminder cron — every 6 hrs, gently nudges the current approver
// for any Pending leave older than REMINDER_AFTER_HRS that hasn't been
// reminded in the last 12 hrs.
export const startLeaveReminderCron = () => {
  cron.schedule("0 */6 * * *", () => runAsSystem("leaveReminder", async () => {
    const cutoff = new Date(Date.now() - REMINDER_AFTER_HRS * 3600 * 1000);
    const stales = await LeaveRequestModel.find({
      status: "Pending",
      updatedAt: { $lt: cutoff },
    })
      .populate("employeeId", "name reportsTo");

    let pinged = 0;
    for (const leave of stales) {
      const reportsTo = leave.employeeId?.reportsTo;
      if (!reportsTo) continue;

      // Resolve the active approver via delegation chain
      const EmployeeService = (await import("../src/module/hr/employee/employee.service.js")).default;
      const approver = await EmployeeService.resolveActiveManager(reportsTo);
      if (!approver) continue;

      // Skip if we've already reminded in the last cron window
      const lastReminderTime = leave.workflowLogs
        ?.filter((w) => w.action === "Reminded")
        ?.map((w) => new Date(w.actionDate).getTime())
        ?.sort((a, b) => b - a)?.[0];
      if (lastReminderTime && (Date.now() - lastReminderTime) < (REMINDER_AFTER_HRS * 3600 * 1000)) continue;

      await NotificationService.notify({
        title: "Leave approval pending",
        message: `${leave.employeeId.name}'s ${leave.leaveType} request has been waiting > ${REMINDER_AFTER_HRS} hrs.`,
        audienceType: "user",
        users: [approver],
        category: "reminder",
        priority: "medium",
        module: "hr",
        actionUrl: "/dashboard/profile",
        actionLabel: "Review",
        reference: { model: "LeaveRequest", documentId: leave._id },
      }).catch(() => {});

      leave.workflowLogs.push({
        action: "Reminded",
        actionBy: null,
        role: "System",
        remarks: `Reminder ping at ${new Date().toISOString()}`,
      });
      await leave.save();
      pinged++;
    }
    if (pinged > 0) logger.info(`Leave reminder cron: pinged ${pinged} approvers`);
  }));
};

// A4-b: Escalation cron — daily 09:00. For any Pending or Manager-Approved
// request whose age exceeds the rule's escalationAfterHours (or 48 hrs
// fallback), notify HR and stamp an "Escalated" workflow row. Idempotent —
// won't escalate twice in 24 hrs.
export const startLeaveEscalationCron = () => {
  cron.schedule("0 9 * * *", () => runAsSystem("leaveEscalation", async () => {
    const all = await LeaveRequestModel.find({
      status: { $in: ["Pending", "Manager Approved"] },
    }).populate("employeeId", "name department");

    let escalated = 0;
    for (const leave of all) {
      const policy = await LeavePolicyService.resolveForEmployee(leave.employeeId);
      const rule = LeavePolicyService.getRule(policy, leave.leaveType);
      const slaHrs = rule?.escalationAfterHours || FALLBACK_SLA_HRS;
      const ageHrs = (Date.now() - new Date(leave.updatedAt).getTime()) / 3600000;
      if (ageHrs < slaHrs) continue;

      // Idempotency — skip if already escalated in last 24 hrs
      const lastEscalation = leave.workflowLogs
        ?.filter((w) => w.action === "Escalated")
        ?.map((w) => new Date(w.actionDate).getTime())
        ?.sort((a, b) => b - a)?.[0];
      if (lastEscalation && (Date.now() - lastEscalation) < (24 * 3600 * 1000)) continue;

      const hrRoleIds = await NotificationService.getRoleIdsByPermission("hr", "leave", "edit");
      if (hrRoleIds.length > 0) {
        await NotificationService.notify({
          title: "Leave SLA breached — needs HR attention",
          message: `${leave.employeeId.name}'s ${leave.leaveType} (${leave.status}) has been pending ${Math.round(ageHrs)} hrs (SLA ${slaHrs} hrs).`,
          audienceType: "role",
          roles: hrRoleIds,
          category: "alert",
          priority: "high",
          module: "hr",
          actionUrl: "/dashboard/profile",
          actionLabel: "Review",
          reference: { model: "LeaveRequest", documentId: leave._id },
        }).catch(() => {});
      }

      leave.workflowLogs.push({
        action: "Escalated",
        actionBy: null,
        role: "System",
        remarks: `SLA breached at ${Math.round(ageHrs)} hrs (limit ${slaHrs}) — escalated to HR`,
      });
      await leave.save();
      escalated++;
    }
    if (escalated > 0) logger.info(`Leave escalation cron: escalated ${escalated} requests`);
  }));
};
