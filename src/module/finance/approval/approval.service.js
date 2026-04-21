import ApprovalRuleModel from "./approvalrule.model.js";
import ApprovalRequestModel from "./approvalrequest.model.js";
import EmployeeModel from "../../hr/employee/employee.model.js";

// Set to true to block all vouchers without an approval rule from auto-approving.
// When false (default), vouchers with no matching rule pass through unblocked
// (backward-compatible behaviour).
const ENFORCE_APPROVAL_FOR_ALL = false;

class ApprovalService {
  // ── Rule CRUD ───────────────────────────────────────────────────────────────
  static async upsertRule({ source_type, thresholds, is_active = true, user_id = "" }) {
    if (!source_type) throw new Error("source_type is required");
    if (!Array.isArray(thresholds) || thresholds.length === 0) {
      throw new Error("thresholds[] is required (at least one band)");
    }
    for (const t of thresholds) {
      if (typeof t.min_amount !== "number") throw new Error("each threshold needs min_amount");
      if (!Array.isArray(t.approvers) || t.approvers.length === 0) {
        throw new Error("each threshold needs at least one approver");
      }
    }
    const sorted = [...thresholds].sort((a, b) => a.min_amount - b.min_amount);

    const existing = await ApprovalRuleModel.findOne({ source_type });
    if (existing) {
      existing.thresholds = sorted;
      existing.is_active  = is_active;
      existing.updated_by = user_id;
      await existing.save();
      return existing;
    }
    return ApprovalRuleModel.create({ source_type, thresholds: sorted, is_active, created_by: user_id });
  }

  static async listRules({ source_type } = {}) {
    const q = {};
    if (source_type) q.source_type = source_type;
    return ApprovalRuleModel.find(q).sort({ source_type: 1 }).lean();
  }

  static async getRule(source_type) {
    const rule = await ApprovalRuleModel.findOne({ source_type, is_active: true }).lean();
    return rule || null;
  }

  // ── Request lifecycle ───────────────────────────────────────────────────────
  // Returns { required, request } — `required` is false when no active rule matches the amount,
  // meaning the caller can proceed without approval.
  static async initiate({ source_type, source_ref, source_no = "", amount, narration = "", initiator_id }) {
    if (!source_type || !source_ref) throw new Error("source_type and source_ref are required");
    if (!initiator_id)               throw new Error("initiator_id is required");
    const amt = Number(amount);
    if (!Number.isFinite(amt))       throw new Error("amount must be numeric");

    const existing = await ApprovalRequestModel.findOne({ source_type, source_ref });
    if (existing && existing.status === "pending") return { required: true, request: existing };
    if (existing && existing.status === "approved") return { required: true, request: existing, already_approved: true };

    const rule = await this.getRule(source_type);
    if (!rule) {
      // No rule configured for this source_type.
      if (ENFORCE_APPROVAL_FOR_ALL) {
        // Strict mode: require manual approval even without a rule
        const request = await ApprovalRequestModel.create({
          source_type,
          source_ref,
          source_no,
          amount:             amt,
          narration,
          required_approvers: [],
          any_of:             false,
          next_approver_id:   "",
          initiated_by:       initiator_id,
          rule_snapshot:      null,
        });
        return { required: true, request_id: request._id, request };
      }
      return { required: false };
    }

    const band = rule.thresholds.find((t) =>
      amt >= t.min_amount && amt <= (t.max_amount ?? Number.MAX_SAFE_INTEGER),
    );
    if (!band) {
      // Amount below smallest band configured.
      if (ENFORCE_APPROVAL_FOR_ALL) {
        const request = await ApprovalRequestModel.create({
          source_type,
          source_ref,
          source_no,
          amount:             amt,
          narration,
          required_approvers: [],
          any_of:             false,
          next_approver_id:   "",
          initiated_by:       initiator_id,
          rule_snapshot:      null,
        });
        return { required: true, request_id: request._id, request };
      }
      return { required: false };
    }

    const request = await ApprovalRequestModel.create({
      source_type,
      source_ref,
      source_no,
      amount:          amt,
      narration,
      required_approvers: band.approvers,
      any_of:            band.any_of,
      next_approver_id:  band.any_of ? "" : band.approvers[0],
      initiated_by:      initiator_id,
      rule_snapshot:     { min_amount: band.min_amount, max_amount: band.max_amount, label: band.label || "" },
    });
    return { required: true, request };
  }

  static async _applyAction({ request_id, actor_id, action, comment = "" }) {
    const request = await ApprovalRequestModel.findById(request_id);
    if (!request)                          throw new Error("Approval request not found");
    if (request.status !== "pending")      throw new Error(`Request already ${request.status}`);

    if (!request.required_approvers.includes(actor_id)) {
      throw new Error("You are not authorized to act on this request");
    }

    const actor = await EmployeeModel.findById(actor_id).select("name email").lean().catch(() => null);
    const actorName = actor?.name || "";

    if (action === "rejected") {
      request.status        = "rejected";
      request.rejected_by   = actor_id;
      request.next_approver_id = "";
      request.completed_at  = new Date();
      request.approval_log.push({ action, actor_id, actor_name: actorName, comment });
      await request.save();
      return request;
    }

    if (action === "approved") {
      if (request.approved_by.includes(actor_id)) {
        throw new Error("You have already approved this request");
      }
      request.approved_by.push(actor_id);
      request.approval_log.push({ action, actor_id, actor_name: actorName, comment });

      const doneAll = request.any_of
        ? true
        : request.required_approvers.every((a) => request.approved_by.includes(a));

      if (doneAll) {
        request.status           = "approved";
        request.next_approver_id = "";
        request.completed_at     = new Date();
      } else {
        const pending = request.required_approvers.find((a) => !request.approved_by.includes(a));
        request.next_approver_id = pending || "";
      }
      await request.save();
      return request;
    }

    // plain comment
    request.approval_log.push({ action: "commented", actor_id, actor_name: actorName, comment });
    await request.save();
    return request;
  }

  static async approve({ request_id, actor_id, comment = "" }) {
    return this._applyAction({ request_id, actor_id, action: "approved", comment });
  }

  static async reject({ request_id, actor_id, comment = "" }) {
    return this._applyAction({ request_id, actor_id, action: "rejected", comment });
  }

  static async comment({ request_id, actor_id, comment = "" }) {
    return this._applyAction({ request_id, actor_id, action: "commented", comment });
  }

  static async withdraw({ request_id, actor_id, comment = "" }) {
    const request = await ApprovalRequestModel.findById(request_id);
    if (!request)                       throw new Error("Approval request not found");
    if (request.status !== "pending")   throw new Error(`Request already ${request.status}`);
    if (request.initiated_by !== actor_id) throw new Error("Only the initiator can withdraw");
    request.status        = "withdrawn";
    request.completed_at  = new Date();
    request.approval_log.push({ action: "withdrawn", actor_id, comment });
    await request.save();
    return request;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────
  static async pendingForUser(user_id, { source_type, page = 1, limit = 20 } = {}) {
    const q = {
      status: "pending",
      $or: [
        { next_approver_id: user_id },
        { required_approvers: user_id, any_of: true },
      ],
    };
    if (source_type) q.source_type = source_type;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const [rows, total] = await Promise.all([
      ApprovalRequestModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      ApprovalRequestModel.countDocuments(q),
    ]);
    return { total, page, limit, rows };
  }

  static async list({ source_type, status, page = 1, limit = 20 } = {}) {
    const q = { is_deleted: { $ne: true } };
    if (source_type) q.source_type = source_type;
    if (status)      q.status      = status;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const [rows, total] = await Promise.all([
      ApprovalRequestModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      ApprovalRequestModel.countDocuments(q),
    ]);
    return { total, page, limit, rows };
  }

  static async getRequest(id) {
    const r = await ApprovalRequestModel.findById(id).lean();
    if (!r) throw new Error("Approval request not found");
    return r;
  }

  // ── Status helper for downstream services ───────────────────────────────────
  // Returns the approval state for a given (source_type, source_ref) so voucher
  // services can gate their own state transitions. Missing record = no approval
  // required (or caller hasn't initiated one).
  static async statusFor({ source_type, source_ref }) {
    const r = await ApprovalRequestModel.findOne({ source_type, source_ref })
      .select("status approved_by rejected_by next_approver_id completed_at")
      .lean();
    return r || null;
  }
}

export default ApprovalService;
