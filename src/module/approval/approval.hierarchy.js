import mongoose from "mongoose";
import EmployeeModel from "../hr/employee/employee.model.js";
import RoleModel from "../role/role.model.js";
import { APPROVER_STRATEGY } from "./approvalrule.model.js";

// ── Approver resolver ───────────────────────────────────────────────────────
//
// Given a threshold band and the initiator, return an ORDERED, DEDUPED list of
// approver employee _ids (string form). The resolver is policy-aware:
//   • Self-approval is blocked (D2) — initiator is filtered out of the result.
//     If that empties a level, the resolver auto-skips to the next level.
//   • Missing data never crashes — if a role has no holders, or reportsTo is
//     not set, we return what we have and let the service decide (fallthrough
//     is logged; service treats empty approvers as a config error).

const asString = (v) => (v == null ? "" : String(v));

async function resolveUsers(threshold) {
  return (threshold.approvers || []).map(asString);
}

async function resolveByRole(threshold) {
  const roleNames = (threshold.roles || []).map((r) => String(r).toUpperCase());
  if (roleNames.length === 0) return [];

  const roles = await RoleModel.find({ roleName: { $in: roleNames } })
    .select("_id roleName")
    .lean();
  if (roles.length === 0) return [];

  // Preserve configured order of roles[] when expanding to employees.
  const orderedRoleIds = roleNames
    .map((rn) => roles.find((r) => r.roleName === rn)?._id)
    .filter(Boolean);

  const employees = await EmployeeModel.find({
    role: { $in: orderedRoleIds },
    isDeleted: { $ne: true },
    status: { $ne: "Inactive" },
  })
    .select("_id role")
    .lean();

  // Group by role to keep the configured role order.
  const byRole = new Map(orderedRoleIds.map((id) => [String(id), []]));
  for (const emp of employees) {
    const key = String(emp.role);
    if (byRole.has(key)) byRole.get(key).push(asString(emp._id));
  }

  const ordered = [];
  for (const id of orderedRoleIds) {
    ordered.push(...(byRole.get(String(id)) || []));
  }
  return ordered;
}

async function resolveReportsTo(threshold, initiatorId) {
  const levels = Math.max(1, Number(threshold.levels || 1));
  const chain = [];
  let cursorId = initiatorId;
  for (let i = 0; i < levels; i += 1) {
    if (!mongoose.isValidObjectId(cursorId)) break;
    const mgr = await EmployeeModel.findById(cursorId).select("reportsTo").lean();
    if (!mgr || !mgr.reportsTo) break;
    chain.push(asString(mgr.reportsTo));
    cursorId = mgr.reportsTo;
  }
  return chain;
}

async function resolveDepartmentHead(_threshold, initiatorId) {
  if (!mongoose.isValidObjectId(initiatorId)) return [];
  const initiator = await EmployeeModel.findById(initiatorId)
    .select("department")
    .lean();
  if (!initiator?.department) return [];

  // Heuristic: a department head is someone in the same department whose role
  // name ends with "_HEAD" — e.g. HR_HEAD, FINANCE_HEAD. If multiple, return all.
  const heads = await EmployeeModel.aggregate([
    { $match: {
      department: initiator.department,
      isDeleted: { $ne: true },
      status: { $ne: "Inactive" },
      _id: { $ne: new mongoose.Types.ObjectId(initiatorId) },
    } },
    { $lookup: {
      from: "roles", localField: "role", foreignField: "_id", as: "roleDoc",
    } },
    { $unwind: "$roleDoc" },
    { $match: { "roleDoc.roleName": /_HEAD$/ } },
    { $project: { _id: 1 } },
  ]);
  return heads.map((h) => asString(h._id));
}

const STRATEGY_RESOLVERS = {
  [APPROVER_STRATEGY.USERS]:            resolveUsers,
  [APPROVER_STRATEGY.ROLE]:             resolveByRole,
  [APPROVER_STRATEGY.REPORTS_TO]:       resolveReportsTo,
  [APPROVER_STRATEGY.DEPARTMENT_HEAD]:  resolveDepartmentHead,
};

export async function resolveApprovers({ threshold, initiator_id }) {
  const strategy = threshold.approver_strategy || APPROVER_STRATEGY.USERS;
  const resolver = STRATEGY_RESOLVERS[strategy] || resolveUsers;
  const raw = await resolver(threshold, asString(initiator_id));

  // Dedupe while preserving order + block self-approval (D2).
  const seen = new Set();
  const initiatorStr = asString(initiator_id);
  const cleaned = [];
  for (const id of raw) {
    if (!id || id === initiatorStr || seen.has(id)) continue;
    seen.add(id);
    cleaned.push(id);
  }
  return cleaned;
}

// ── Simulator helper ────────────────────────────────────────────────────────
// Returns the band that would match + the resolved approvers, without writing
// anything. Used by /approval/rules/simulate.
export function pickBand(rule, amount) {
  if (!rule || !Array.isArray(rule.thresholds)) return null;
  const amt = Number(amount);
  if (!Number.isFinite(amt)) return null;
  return (
    rule.thresholds.find(
      (t) => amt >= t.min_amount && amt <= (t.max_amount ?? Number.MAX_SAFE_INTEGER),
    ) || null
  );
}
