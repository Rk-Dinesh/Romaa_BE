import cron from "node-cron";
import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import LeaveBalanceHistoryService from "../src/module/hr/leave/leaveBalanceHistory.service.js";
import LeavePolicyService from "../src/module/hr/leavePolicy/leavePolicy.service.js";
import LeaveEncashmentModel from "../src/module/hr/leavePolicy/leaveEncashment.model.js";
import { runAsSystem } from "../src/common/requestContext.js";

// --- Fallback annual entitlements when no LeavePolicy is configured ---
const FALLBACK_ANNUAL = {
  CL:          12,
  SL:          12,
  Maternity:   84,
  Paternity:   15,
  Bereavement:  5,
};

// Fallback PL carry-forward cap (days)
const FALLBACK_PL_CAP = 30;

export const startYearEndLeaveResetCron = () => {
  // Runs at 23:55 on December 31 every year
  cron.schedule("55 23 31 12 *", () => runAsSystem("yearEndLeaveReset", async () => {
    const year = new Date().getFullYear();
    console.log(`🗓️  [CRON] Year-End Leave Reset starting for ${year}...`);

    try {
      const employees = await EmployeeModel.find({
        status: "Active",
        isDeleted: { $ne: true },
      }).select("_id leaveBalance name employeeId department dateOfJoining hrStatus payroll");

      let stats = { processed: 0, errors: 0, encashmentsEmitted: 0 };

      for (const emp of employees) {
        try {
          const historyBatch = [];
          const updates = {};

          // Resolve policy (department > DEFAULT > fallback constants)
          const policy = await LeavePolicyService.resolveForEmployee(emp);

          const entitlementFor = (t) => {
            const rule = LeavePolicyService.getRule(policy, t);
            return rule
              ? LeavePolicyService.getEntitlement(rule, emp) || (FALLBACK_ANNUAL[t] || 0)
              : (FALLBACK_ANNUAL[t] || 0);
          };

          // ── 1. ANNUAL_RESET leaves: reset to entitlement ──────────────────
          for (const t of ["CL", "SL", "Maternity", "Paternity", "Bereavement"]) {
            const rule = LeavePolicyService.getRule(policy, t);
            // EVENT_TRIGGERED grants are NOT reset — they're event-driven.
            if (rule?.refillType === "EVENT_TRIGGERED") continue;

            const entitlement = entitlementFor(t);
            const before = emp.leaveBalance?.[t] ?? 0;
            if (before !== entitlement) {
              updates[`leaveBalance.${t}`] = entitlement;
              historyBatch.push({
                employeeId:    emp._id,
                leaveType:     t,
                changeType:    "Reset",
                amount:        entitlement,
                balanceBefore: before,
                balanceAfter:  entitlement,
                reason:        `Annual Reset ${year} → ${year + 1} (entitlement: ${entitlement})`,
                performedBy:   null,
              });
            }
          }

          // ── 2. PL carry-forward + ENCASHMENT for excess ───────────────────
          const plRule    = LeavePolicyService.getRule(policy, "PL");
          const plCap     = plRule?.carryForwardCap ?? FALLBACK_PL_CAP;
          const currentPL = emp.leaveBalance?.PL ?? 0;
          const carriedPL = Math.min(currentPL, plCap);
          const excessPL  = currentPL - carriedPL;

          updates["leaveBalance.PL"] = carriedPL;
          historyBatch.push({
            employeeId:    emp._id,
            leaveType:     "PL",
            changeType:    excessPL > 0 ? "Reset" : "CarryForward",
            amount:        carriedPL,
            balanceBefore: currentPL,
            balanceAfter:  carriedPL,
            reason: excessPL > 0
              ? `PL capped at carry-forward limit (${plCap} days)`
              : `PL carried forward: ${carriedPL} day(s) into ${year + 1}`,
            performedBy:   null,
          });

          // LP6: emit an encashment voucher for the excess instead of lapsing.
          if (excessPL > 0 && plRule?.encashable) {
            // Rate selection — BASIC | GROSS | FIXED
            const basic = emp.payroll?.basicSalary || 0;
            const gross = Math.round(basic * 1.5); // approx (basic + HRA40 + DA10 = 150% of basic)
            let ratePerDay = 0;
            if (plRule.encashmentBasis === "GROSS") ratePerDay = Math.round(gross / 30);
            else if (plRule.encashmentBasis === "FIXED") ratePerDay = plRule.encashmentRatePerDay || 0;
            else ratePerDay = Math.round(basic / 30); // BASIC default

            const amount = Math.round(ratePerDay * excessPL);

            await LeaveEncashmentModel.create({
              employeeId: emp._id,
              leaveType:  "PL",
              days:       excessPL,
              rate:       ratePerDay,
              amount,
              basis:      plRule.encashmentBasis || "BASIC",
              payrollMonth: 1,
              payrollYear:  year + 1,
              status:     "Pending",
              notes: `Year-end encashment ${year} (${excessPL} day(s) above cap of ${plCap})`,
              createdBy:  null,
            }).catch((e) => console.warn(`Encashment emit failed for ${emp.employeeId}:`, e.message));

            historyBatch.push({
              employeeId:    emp._id,
              leaveType:     "PL",
              changeType:    "Encashed",
              amount:        excessPL,
              balanceBefore: carriedPL + excessPL,
              balanceAfter:  carriedPL,
              reason: `Encashed ${excessPL} day(s) (rate ₹${ratePerDay}, total ₹${amount})`,
              performedBy:   null,
            });

            stats.encashmentsEmitted++;
          }

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
