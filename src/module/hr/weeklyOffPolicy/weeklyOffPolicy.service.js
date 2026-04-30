import WeeklyOffPolicyModel from "./weeklyOffPolicy.model.js";

class WeeklyOffPolicyService {
  // --- Resolver used by CalendarService.checkDayStatus ---
  // Returns the rules array to apply for the given department, falling back
  // to "DEFAULT" if no department-specific row is active. Returns null when
  // nothing is configured at all (caller falls back to hardcoded behaviour).
  static async resolveForDepartment(department) {
    if (department) {
      const own = await WeeklyOffPolicyModel
        .findOne({ department, isActive: true })
        .lean();
      if (own) return own;
    }
    const def = await WeeklyOffPolicyModel
      .findOne({ department: "DEFAULT", isActive: true })
      .lean();
    return def || null;
  }

  // Helper: which week-of-month a date falls in (1..5)
  static weekOfMonth(date) {
    return Math.ceil(new Date(date).getDate() / 7);
  }

  // Pure decision: given a set of rules + a date, is it a weekly-off?
  static evaluate(date, policy) {
    const dow = new Date(date).getDay();
    const wom = WeeklyOffPolicyService.weekOfMonth(date);

    if (!policy || !policy.weeklyOffs || policy.weeklyOffs.length === 0) {
      // Hardcoded fallback (matches legacy CalendarService behaviour).
      if (dow === 0) return { isOff: true, reason: "Weekly Off (Sunday)" };
      if (dow === 6 && (wom === 2 || wom === 4)) {
        return { isOff: true, reason: "Weekly Off (2nd/4th Saturday)" };
      }
      return { isOff: false };
    }

    for (const rule of policy.weeklyOffs) {
      if (rule.dow !== dow) continue;
      if (rule.weeks && rule.weeks.length > 0 && !rule.weeks.includes(wom)) continue;
      const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dow];
      const reason = rule.label
        || (rule.weeks?.length
              ? `Weekly Off (${rule.weeks.join("/")} ${dayName})`
              : `Weekly Off (${dayName})`);
      return { isOff: true, reason };
    }
    return { isOff: false };
  }

  // --- CRUD ---
  static async upsert({ department, weeklyOffs, isActive, notes, actorId }) {
    if (!department) throw { statusCode: 400, message: "department is required" };
    department = String(department).trim();
    const update = {
      weeklyOffs: Array.isArray(weeklyOffs) ? weeklyOffs : [],
      ...(isActive !== undefined ? { isActive } : {}),
      ...(notes !== undefined ? { notes } : {}),
      updatedBy: actorId || null,
    };
    const doc = await WeeklyOffPolicyModel.findOneAndUpdate(
      { department },
      { $set: update, $setOnInsert: { department, createdBy: actorId || null } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return doc;
  }

  static async list({ isActive, search, page, limit } = {}) {
    const q = {};
    if (isActive !== undefined) q.isActive = isActive === true || isActive === "true";
    if (search) {
      const s = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      q.department = { $regex: s, $options: "i" };
    }
    const pg  = Math.max(1, parseInt(page)  || 1);
    const lim = Math.max(1, Math.min(200, parseInt(limit) || 50));
    const [data, total] = await Promise.all([
      WeeklyOffPolicyModel.find(q).sort({ department: 1 }).skip((pg - 1) * lim).limit(lim).lean(),
      WeeklyOffPolicyModel.countDocuments(q),
    ]);
    return { data, total, page: pg, limit: lim };
  }

  static async getByDepartment(department) {
    const doc = await WeeklyOffPolicyModel.findOne({ department }).lean();
    if (!doc) throw { statusCode: 404, message: `No policy for department '${department}'` };
    return doc;
  }

  static async deleteByDepartment(department) {
    const out = await WeeklyOffPolicyModel.findOneAndDelete({ department });
    if (!out) throw { statusCode: 404, message: `No policy for department '${department}'` };
    return out;
  }

  // Preview helper: HR can pass {department, fromdate, todate} to see which
  // dates the policy declares off — handy for the calendar UI.
  static async preview({ department, fromdate, todate }) {
    const policy = await WeeklyOffPolicyService.resolveForDepartment(department);
    const start = new Date(fromdate); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(todate);   end.setUTCHours(0, 0, 0, 0);
    const out = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const verdict = WeeklyOffPolicyService.evaluate(d, policy);
      if (verdict.isOff) {
        out.push({ date: new Date(d).toISOString().split("T")[0], reason: verdict.reason });
      }
    }
    return { resolvedFrom: policy?.department || "FALLBACK", weeklyOffs: out };
  }
}

export default WeeklyOffPolicyService;
