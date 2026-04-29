import cron from "node-cron";
import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import LeaveBalanceHistoryService from "../src/module/hr/leave/leaveBalanceHistory.service.js";
import { runAsSystem } from "../src/common/requestContext.js";

// --- Leave entitlements reset every Jan 1 ---
const ANNUAL_ENTITLEMENTS = {
  CL:          12,
  SL:          12,
  Maternity:   84,
  Paternity:   15,
  Bereavement:  5,
};

// PL carry-forward cap (days)
const PL_CARRY_FORWARD_CAP = 30;

export const startYearEndLeaveResetCron = () => {
  // Runs at 23:55 on December 31 every year
  cron.schedule("55 23 31 12 *", () => runAsSystem("yearEndLeaveReset", async () => {
    const year = new Date().getFullYear();
    console.log(`🗓️  [CRON] Year-End Leave Reset starting for ${year}...`);

    try {
      const employees = await EmployeeModel.find({
        status: "Active",
        isDeleted: { $ne: true },
      }).select("_id leaveBalance name employeeId");

      let stats = { processed: 0, errors: 0 };

      for (const emp of employees) {
        try {
          const historyBatch = [];
          const updates = {};

          // ── 1. Fixed annual entitlements: reset to default ────────────────
          for (const [leaveType, entitlement] of Object.entries(ANNUAL_ENTITLEMENTS)) {
            const before = emp.leaveBalance?.[leaveType] ?? 0;

            if (before !== entitlement) {
              updates[`leaveBalance.${leaveType}`] = entitlement;
              historyBatch.push({
                employeeId:    emp._id,
                leaveType,
                changeType:    "Reset",
                amount:        entitlement,
                balanceBefore: before,
                balanceAfter:  entitlement,
                reason:        `Annual Reset ${year} → ${year + 1} (entitlement: ${entitlement} days)`,
                performedBy:   null,
              });
            }
          }

          // ── 2. PL carry-forward (cap at PL_CARRY_FORWARD_CAP days) ────────
          const currentPL = emp.leaveBalance?.PL ?? 0;
          const carriedPL = Math.min(currentPL, PL_CARRY_FORWARD_CAP);

          updates["leaveBalance.PL"] = carriedPL;
          historyBatch.push({
            employeeId:    emp._id,
            leaveType:     "PL",
            changeType:    carriedPL < currentPL ? "Reset" : "CarryForward",
            amount:        carriedPL,
            balanceBefore: currentPL,
            balanceAfter:  carriedPL,
            reason: carriedPL < currentPL
              ? `PL capped at carry-forward limit (${PL_CARRY_FORWARD_CAP} days) — ${currentPL - carriedPL} days lapsed`
              : `PL carried forward: ${carriedPL} day(s) into ${year + 1}`,
            performedBy:   null,
          });

          // ── 3. CompOff — expire overdue credits ───────────────────────────
          const now = new Date();
          let expiredCount = 0;
          if (emp.leaveBalance?.compOff?.length) {
            emp.leaveBalance.compOff.forEach((credit) => {
              if (!credit.isUsed && new Date(credit.expiryDate) < now) {
                credit.isUsed = true;
                expiredCount++;
              }
            });

            if (expiredCount > 0) {
              updates["leaveBalance.compOff"] = emp.leaveBalance.compOff;
              historyBatch.push({
                employeeId:    emp._id,
                leaveType:     "CompOff",
                changeType:    "Expiry",
                amount:        expiredCount,
                balanceBefore: emp.leaveBalance.compOff.filter(c => !c.isUsed).length + expiredCount,
                balanceAfter:  emp.leaveBalance.compOff.filter(c => !c.isUsed).length,
                reason:        `${expiredCount} CompOff credit(s) expired on year-end ${year}`,
                performedBy:   null,
              });
            }
          }

          // ── 4. Apply all balance updates atomically ───────────────────────
          if (Object.keys(updates).length > 0) {
            await EmployeeModel.findByIdAndUpdate(emp._id, { $set: updates });
          }

          // ── 5. Write history entries (fire-and-forget order is fine) ──────
          for (const entry of historyBatch) {
            await LeaveBalanceHistoryService.log(entry);
          }

          stats.processed++;
        } catch (empErr) {
          stats.errors++;
          console.error(`❌ [CRON] Year-end reset failed for employee ${emp.employeeId}:`, empErr.message);
        }
      }

      console.log(`✅ [CRON] Year-End Leave Reset complete. Processed: ${stats.processed}, Errors: ${stats.errors}`);
    } catch (err) {
      console.error("❌ [CRON] Year-End Leave Reset job failed:", err);
    }
  }));
};
