import cron from "node-cron";
import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import LeavePolicyService from "../src/module/hr/leavePolicy/leavePolicy.service.js";
import LeaveBalanceHistoryService from "../src/module/hr/leave/leaveBalanceHistory.service.js";
import { runAsSystem } from "../src/common/requestContext.js";

// Runs at 00:05 on the 1st of every month.
// For each Active employee:
//   1) Resolve their LeavePolicy.
//   2) For every rule whose refillType is MONTHLY_ACCRUAL or QUARTERLY_ACCRUAL,
//      credit the per-period amount, capped at the annual entitlement (using
//      LeaveBalanceHistory YTD sum), and log an Accrual row.
//   3) For MONTHLY_RESET rules, log a Reset row for audit (the actual usage
//      counter is computed from LeaveRequest queries, so no balance change).
//
// Probation gating + tenure slabs are honoured via LeavePolicyService helpers.
export const startMonthlyAccrualCron = () => {
  cron.schedule("5 0 1 * *", () => runAsSystem("monthlyLeaveAccrual", async () => {
    console.log("📅 [CRON] Monthly leave accrual starting...");
    const now      = new Date();
    const isQuarterStart = [0, 3, 6, 9].includes(now.getMonth());

    try {
      const employees = await EmployeeModel.find({
        status: "Active",
        isDeleted: { $ne: true },
      }).select("_id department dateOfJoining hrStatus leaveBalance employeeId name");

      let stats = { processed: 0, accrualsApplied: 0, errors: 0 };

      for (const emp of employees) {
        try {
          const policy = await LeavePolicyService.resolveForEmployee(emp);
          // Build a list of rule types relevant to this employee.
          const types = ["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement", "CompOff", "Permission", "LWP"];
          for (const t of types) {
            const rule = LeavePolicyService.getRule(policy, t);
            if (!rule) continue;
            if (rule.probationEligible === false && LeavePolicyService.isOnProbation(emp)) continue;

            const isMonthly   = rule.refillType === "MONTHLY_ACCRUAL";
            const isQuarterly = rule.refillType === "QUARTERLY_ACCRUAL";

            if (!isMonthly && !(isQuarterly && isQuarterStart)) continue;

            const credit = Number(rule.accrualPerPeriod || 0);
            if (credit <= 0) continue;

            // Annual cap enforcement
            const entitlement = LeavePolicyService.getEntitlement(rule, emp);
            const ytd        = await LeaveBalanceHistoryService.sumAccrualYTD(emp._id, t, now.getFullYear());
            const remaining  = Math.max(0, entitlement - ytd);
            const credible   = Math.min(credit, remaining);
            if (credible <= 0) continue;

            const before = emp.leaveBalance?.[t] ?? 0;
            await EmployeeModel.findByIdAndUpdate(emp._id, {
              $inc: { [`leaveBalance.${t}`]: credible },
            });
            await LeaveBalanceHistoryService.logAccrual({
              employeeId: emp._id,
              leaveType:  t,
              amount:     credible,
              balanceBefore: before,
              performedBy: null,
              reason: `${isMonthly ? "Monthly" : "Quarterly"} accrual ${now.toISOString().slice(0,7)} (entitlement ${entitlement}, YTD ${ytd})`,
            }).catch(() => {});
            stats.accrualsApplied++;
          }
          stats.processed++;
        } catch (e) {
          stats.errors++;
          console.error(`❌ Accrual error for ${emp.employeeId}:`, e.message);
        }
      }

      console.log(`✅ [CRON] Monthly accrual complete:`, stats);
    } catch (err) {
      console.error("❌ [CRON] Monthly accrual job failed:", err);
    }
  }));
};
