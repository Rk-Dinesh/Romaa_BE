import LeavePolicyModel from "./leavePolicy.model.js";

// Default fallback values used when no policy is configured at all.
// Mirrors the legacy hardcoded constants in Employee.leaveBalance defaults
// (PL=0, CL=12, SL=12, Maternity=84, Paternity=15, Bereavement=5) so existing
// employee documents keep working without requiring HR to seed a policy.
//
// Maternity / Paternity / Bereavement are ANNUAL_RESET in the fallback so the
// schema defaults are re-filled at year-end. HR can override this on a per-
// department LeavePolicy by setting refillType: "EVENT_TRIGGERED" + adding
// a tenureSlabs / lifetime cap rule of their choice. The /leave/grant
// endpoint works regardless of refillType — it's a top-up channel for HR to
// record life events and add balance idempotently.
const FALLBACK_RULES = {
  CL:          { refillType: "ANNUAL_RESET",     annualEntitlement: 12, carryForwardCap: 0,  encashable: false, probationEligible: false, proRataForNewJoiners: true,  monthlyCap: null, validityDays: null, requiresManagerApproval: true,  requiresHRApproval: true,  autoApproveUnderDays: 0 },
  SL:          { refillType: "ANNUAL_RESET",     annualEntitlement: 12, carryForwardCap: 0,  encashable: false, probationEligible: true,  proRataForNewJoiners: true,  docsRequiredAfterDays: 3, requiresManagerApproval: true, requiresHRApproval: true, autoApproveUnderDays: 0 },
  PL:          { refillType: "MONTHLY_ACCRUAL",  annualEntitlement: 24, accrualPerPeriod: 2, carryForwardCap: 30, encashable: true, encashmentBasis: "BASIC", probationEligible: false, proRataForNewJoiners: true, requiresManagerApproval: true, requiresHRApproval: true, minNoticeDays: 7 },
  // Maternity / Paternity / Bereavement: ANNUAL_RESET so schema-default starting
  // balances (84/15/5) keep being honoured. proRataForNewJoiners is true to
  // align with CL/SL/PL — a mid-year hire gets entitlement × monthsRemaining/12.
  // HR can override per-department via LeavePolicy if a different rule (e.g.
  // statutory full-entitlement Maternity) is required.
  Maternity:   { refillType: "ANNUAL_RESET",     annualEntitlement: 84, carryForwardCap: 0, encashable: false, proRataForNewJoiners: true, requiresManagerApproval: false, requiresHRApproval: true },
  Paternity:   { refillType: "ANNUAL_RESET",     annualEntitlement: 15, carryForwardCap: 0, encashable: false, proRataForNewJoiners: true, requiresManagerApproval: true,  requiresHRApproval: true },
  Bereavement: { refillType: "ANNUAL_RESET",     annualEntitlement: 5,  carryForwardCap: 0, encashable: false, proRataForNewJoiners: true, requiresManagerApproval: true,  requiresHRApproval: false },
  CompOff:     { refillType: "EARNED",           validityDays: 60,        requiresManagerApproval: true,  requiresHRApproval: false },
  Permission:  { refillType: "MONTHLY_RESET",    monthlyCap: 3,           requiresManagerApproval: true,  requiresHRApproval: false, autoApproveUnderDays: 0 },
  LWP:         { refillType: "MANUAL_ONLY",      requiresManagerApproval: true, requiresHRApproval: true },
};

class LeavePolicyService {
  // --- CRUD ---
  static async upsert({ policyName, scope, effectiveFrom, effectiveTo, isActive, rules, notes, actorId }) {
    if (!scope) throw { statusCode: 400, message: "scope is required" };
    if (!policyName) throw { statusCode: 400, message: "policyName is required" };

    const update = {
      policyName,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo:   effectiveTo ? new Date(effectiveTo) : null,
      isActive:      isActive !== undefined ? isActive : true,
      rules:         Array.isArray(rules) ? rules : [],
      notes,
      updatedBy:     actorId || null,
    };

    // Allow multiple policies per scope as long as effective windows don't overlap
    // For simplicity here we keep one *active* row per scope and effective window
    // by finding-and-updating the active row at this scope (or inserting a new one).
    const existing = await LeavePolicyModel.findOne({ scope, isActive: true }).lean();
    if (existing) {
      const doc = await LeavePolicyModel.findByIdAndUpdate(existing._id, { $set: update }, { new: true, runValidators: true });
      return doc;
    }
    return await LeavePolicyModel.create({ ...update, scope, createdBy: actorId || null });
  }

  static async list({ scope, isActive, page, limit, search } = {}) {
    const q = {};
    if (scope) q.scope = scope;
    if (isActive !== undefined) q.isActive = isActive === true || isActive === "true";
    if (search) {
      const s = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      q.$or = [{ policyName: { $regex: s, $options: "i" } }, { scope: { $regex: s, $options: "i" } }];
    }
    const pg  = Math.max(1, parseInt(page)  || 1);
    const lim = Math.max(1, Math.min(200, parseInt(limit) || 50));
    const [data, total] = await Promise.all([
      LeavePolicyModel.find(q).sort({ scope: 1, effectiveFrom: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
      LeavePolicyModel.countDocuments(q),
    ]);
    return { data, total, page: pg, limit: lim };
  }

  static async getById(id) {
    const doc = await LeavePolicyModel.findById(id).lean();
    if (!doc) throw { statusCode: 404, message: "Policy not found" };
    return doc;
  }

  static async deleteById(id) {
    const out = await LeavePolicyModel.findByIdAndDelete(id);
    if (!out) throw { statusCode: 404, message: "Policy not found" };
    return out;
  }

  // --- Resolver ---
  // department > DEFAULT > null. Active row whose effective window covers `now`.
  static async resolveForDepartment(department, when = new Date()) {
    const baseQuery = (scope) => ({
      scope,
      isActive: true,
      effectiveFrom: { $lte: when },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: when } }],
    });
    if (department) {
      const own = await LeavePolicyModel.findOne(baseQuery(department)).sort({ effectiveFrom: -1 }).lean();
      if (own) return own;
    }
    const def = await LeavePolicyModel.findOne(baseQuery("DEFAULT")).sort({ effectiveFrom: -1 }).lean();
    return def || null;
  }

  static async resolveForEmployee(employee, when = new Date()) {
    return LeavePolicyService.resolveForDepartment(employee?.department, when);
  }

  // --- Rule helpers ---
  // Returns the policy rule for a leave type — falls back to FALLBACK_RULES
  // so callers never need a null check.
  static getRule(policy, leaveType) {
    const r = policy?.rules?.find((x) => x.leaveType === leaveType);
    if (r) return { ...FALLBACK_RULES[leaveType], ...r };
    return FALLBACK_RULES[leaveType] || null;
  }

  // Returns the entitlement to use for an employee given tenure slabs.
  static getEntitlement(rule, employee) {
    if (!rule) return 0;
    if (Array.isArray(rule.tenureSlabs) && rule.tenureSlabs.length > 0 && employee?.dateOfJoining) {
      const months = LeavePolicyService.monthsOfService(employee.dateOfJoining);
      const sorted = rule.tenureSlabs.slice().sort((a, b) => b.minMonths - a.minMonths);
      for (const slab of sorted) {
        if (months >= slab.minMonths) return slab.entitlement;
      }
    }
    return rule.annualEntitlement || 0;
  }

  static monthsOfService(dateOfJoining, when = new Date()) {
    if (!dateOfJoining) return 0;
    const d = new Date(dateOfJoining);
    return (when.getFullYear() - d.getFullYear()) * 12 + (when.getMonth() - d.getMonth());
  }

  // True if `range` overlaps any blackout window in the rule.
  static checkBlackout(rule, fromDate, toDate) {
    if (!rule?.blackoutDates?.length) return null;
    const f = new Date(fromDate); const t = new Date(toDate);
    for (const b of rule.blackoutDates) {
      const bf = new Date(b.from); const bt = new Date(b.to);
      // overlap iff f <= bt && bf <= t
      if (f <= bt && bf <= t) return b;
    }
    return null;
  }

  // Probation-related veto.
  static isOnProbation(employee) {
    return employee?.hrStatus === "Probation";
  }

  // H3: does the rule require HOD approval for THIS leave?
  // True when requiresHODApproval is on AND (no hodMinDays OR totalDays >= hodMinDays).
  static needsHOD(rule, leave) {
    if (!rule?.requiresHODApproval) return false;
    if (rule.hodMinDays && (leave?.totalDays ?? 0) < rule.hodMinDays) return false;
    return true;
  }

  // H3: resolve the HOD's _id for an employee via the Department directory.
  // Returns null if no Department row exists for `employee.department` or
  // its headId is unset — caller treats this as "skip HOD step".
  static async resolveHODForEmployee(employee) {
    if (!employee?.department) return null;
    const DepartmentService = (await import("../department/department.service.js")).default;
    const dept = await DepartmentService.getByName(employee.department);
    return dept?.headId || null;
  }

  // H3: terminal-stage decider. Given role + rule + (effectively-needs-HOD)
  // + needs-HR, returns { status, isFinal } describing the next state.
  // Used by actionLeave so the routing logic is in one place and testable.
  static getNextStage({ role, effectiveNeedsHOD, needsHR }) {
    if (role === "Manager") {
      if (effectiveNeedsHOD)  return { status: "Manager Approved", isFinal: false };
      if (needsHR)            return { status: "Manager Approved", isFinal: false };
      return                         { status: "HR Approved",      isFinal: true  };
    }
    if (role === "HOD") {
      if (needsHR)            return { status: "HOD Approved",     isFinal: false };
      return                         { status: "HR Approved",      isFinal: true  };
    }
    if (role === "HR") {
      return                         { status: "HR Approved",      isFinal: true  };
    }
    throw { statusCode: 400, message: `Unknown role: ${role}` };
  }

  static get FALLBACK_RULES() { return FALLBACK_RULES; }
}

export default LeavePolicyService;
