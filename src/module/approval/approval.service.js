import nodemailer from "nodemailer";
import ApprovalRuleModel, { APPROVER_STRATEGY } from "./approvalrule.model.js";
import ApprovalRequestModel from "./approvalrequest.model.js";
import EmployeeModel from "../hr/employee/employee.model.js";
import AuditLogService from "../finance/audit/auditlog.service.js";
import logger from "../../config/logger.js";
import { APPROVAL_STATUS, AUDIT_ACTION } from "../finance/finance.constants.js";
import { emitFinanceEvent, FINANCE_EVENTS } from "../finance/events/financeEvents.js";
import { emitApprovalEvent, APPROVAL_EVENTS } from "./approval.events.js";
import { resolveApprovers, pickBand } from "./approval.hierarchy.js";

// ── Internal email helper ─────────────────────────────────────────────────────
const _transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function _sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  await _transporter.sendMail({
    from: `"Romaa Approvals" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

// When true, every source_type MUST have an active rule — otherwise initiate()
// still returns required:false and lets the caller proceed (backward-compatible).
const ENFORCE_APPROVAL_FOR_ALL = false;

class ApprovalService {
  // ── Rule CRUD ─────────────────────────────────────────────────────────────
  static async upsertRule({
    source_type,
    module_label,
    amount_field,
    thresholds,
    is_active = true,
    user_id = "",
  }) {
    if (!source_type) throw new Error("source_type is required");
    if (!Array.isArray(thresholds) || thresholds.length === 0) {
      throw new Error("thresholds[] is required (at least one band)");
    }

    // Validate each band against its declared strategy.
    for (const t of thresholds) {
      if (typeof t.min_amount !== "number") throw new Error("each threshold needs min_amount");
      const strat = t.approver_strategy || APPROVER_STRATEGY.USERS;
      if (strat === APPROVER_STRATEGY.USERS) {
        if (!Array.isArray(t.approvers) || t.approvers.length === 0) {
          throw new Error("USERS strategy needs at least one approver");
        }
      } else if (strat === APPROVER_STRATEGY.ROLE) {
        if (!Array.isArray(t.roles) || t.roles.length === 0) {
          throw new Error("ROLE strategy needs at least one role name");
        }
      } else if (strat === APPROVER_STRATEGY.REPORTS_TO) {
        if (!t.levels || t.levels < 1) throw new Error("REPORTS_TO strategy needs levels >= 1");
      } else if (strat === APPROVER_STRATEGY.DEPARTMENT_HEAD) {
        // no extra inputs required
      } else {
        throw new Error(`Unknown approver_strategy: ${strat}`);
      }
    }

    const sorted = [...thresholds].sort((a, b) => a.min_amount - b.min_amount);

    const existing = await ApprovalRuleModel.findOne({ source_type });
    if (existing) {
      existing.thresholds   = sorted;
      existing.is_active    = is_active;
      if (module_label !== undefined) existing.module_label = module_label;
      if (amount_field !== undefined) existing.amount_field = amount_field;
      existing.updated_by   = user_id || null;
      await existing.save();
      return existing;
    }
    return ApprovalRuleModel.create({
      source_type,
      module_label: module_label || "",
      amount_field: amount_field || "amount",
      thresholds:   sorted,
      is_active,
      created_by:   user_id || null,
    });
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

  static async deleteRule(source_type, user_id = "") {
    const r = await ApprovalRuleModel.findOneAndUpdate(
      { source_type },
      { is_active: false, updated_by: user_id || null },
      { new: true },
    );
    return r;
  }

  // ── Simulator ─────────────────────────────────────────────────────────────
  // Dry-run the resolver without writing. Returns { rule, band, approvers[] }
  // so the Settings UI can show admins who will be routed before they save.
  static async simulate({ source_type, amount, initiator_id }) {
    const rule = await this.getRule(source_type);
    if (!rule) return { rule: null, band: null, approvers: [], reason: "no_rule" };
    const band = pickBand(rule, amount);
    if (!band) return { rule, band: null, approvers: [], reason: "no_band_match" };
    const approvers = await resolveApprovers({ threshold: band, initiator_id });
    const approverDocs = approvers.length
      ? await EmployeeModel.find({ _id: { $in: approvers } })
          .select("_id name email role department")
          .populate("role", "roleName")
          .lean()
      : [];
    // Keep the order the resolver returned, not Mongo's default.
    const ordered = approvers
      .map((id) => approverDocs.find((d) => String(d._id) === id))
      .filter(Boolean);
    return {
      rule: { source_type: rule.source_type, module_label: rule.module_label, amount_field: rule.amount_field },
      band,
      approvers: ordered,
      reason: ordered.length ? "ok" : "empty_resolution",
    };
  }

  // ── Request lifecycle ─────────────────────────────────────────────────────
  // Returns { required, request } — `required:false` means no rule matched and
  // the caller may proceed without approval.
  static async initiate({ source_type, source_ref, source_no = "", amount, narration = "", initiator_id }) {
    if (!source_type || !source_ref) throw new Error("source_type and source_ref are required");
    if (!initiator_id)               throw new Error("initiator_id is required");
    const amt = Number(amount);
    if (!Number.isFinite(amt))       throw new Error("amount must be numeric");

    const existing = await ApprovalRequestModel.findOne({ source_type, source_ref });
    if (existing && existing.status === APPROVAL_STATUS.PENDING) {
      return { required: true, request: existing };
    }
    if (existing && existing.status === APPROVAL_STATUS.APPROVED) {
      return { required: true, request: existing, already_approved: true };
    }

    const rule = await this.getRule(source_type);
    if (!rule) {
      if (ENFORCE_APPROVAL_FOR_ALL) {
        return this._createStubRequest({ source_type, source_ref, source_no, amount: amt, narration, initiator_id });
      }
      return { required: false };
    }

    const band = pickBand(rule, amt);
    if (!band) {
      if (ENFORCE_APPROVAL_FOR_ALL) {
        return this._createStubRequest({ source_type, source_ref, source_no, amount: amt, narration, initiator_id });
      }
      return { required: false };
    }

    const approvers = await resolveApprovers({ threshold: band, initiator_id });
    if (approvers.length === 0) {
      // A matched band resolved to no one (e.g. role has no holders). Don't
      // silently skip approval — surface it as a configuration error.
      throw new Error(`Approval rule for ${source_type} matched a band but resolved to 0 approvers (check role holders / reportsTo chain)`);
    }

    const request = await ApprovalRequestModel.create({
      source_type,
      source_ref,
      source_no,
      amount:             amt,
      narration,
      required_approvers: approvers,
      any_of:             !!band.any_of,
      next_approver_id:   band.any_of ? "" : approvers[0],
      initiated_by:       String(initiator_id),
      rule_snapshot: {
        min_amount:        band.min_amount,
        max_amount:        band.max_amount,
        label:             band.label || "",
        approver_strategy: band.approver_strategy || APPROVER_STRATEGY.USERS,
        roles:             band.roles || [],
        levels:            band.levels || 0,
      },
    });

    emitApprovalEvent(APPROVAL_EVENTS.REQUESTED, {
      source_type, source_ref: String(source_ref), source_no,
      amount: amt, request_id: String(request._id), initiator_id: String(initiator_id),
    });

    // Notify approvers by email (best-effort, logged on failure).
    this._notifyApproversAsync({ request, source_type, source_no, amount: amt, initiator_id, approvers }).catch((err) => {
      logger.warn({ context: "approval.initiate.email", message: err.message });
    });

    return { required: true, request };
  }

  static async _createStubRequest({ source_type, source_ref, source_no, amount, narration, initiator_id }) {
    const request = await ApprovalRequestModel.create({
      source_type,
      source_ref,
      source_no,
      amount,
      narration,
      required_approvers: [],
      any_of:             false,
      next_approver_id:   "",
      initiated_by:       String(initiator_id),
      rule_snapshot:      null,
    });
    return { required: true, request };
  }

  static async _notifyApproversAsync({ request, source_type, source_no, amount, initiator_id, approvers }) {
    const initiatorDoc = await EmployeeModel.findById(initiator_id).select("name").lean();
    const initiatorName = initiatorDoc?.name || "Team";
    const approverDocs = await EmployeeModel.find({ _id: { $in: approvers } }).select("name email").lean();
    for (const approver of approverDocs) {
      if (!approver.email) continue;
      await _sendEmail({
        to:      approver.email,
        subject: `Action Required: Approve ${source_no || source_type}`,
        html: `
          <p>Hi ${approver.name},</p>
          <p>A new <strong>${source_type}</strong> ${source_no ? `<strong>${source_no}</strong>` : ""}
          for <strong>${amount?.toLocaleString("en-IN") ?? amount}</strong> requires your approval.</p>
          <p>Submitted by: ${initiatorName}</p>
          <p>Please log in to review and approve/reject.</p>
        `,
      }).catch((e) => logger.warn({ context: "approval.email.send", to: approver.email, message: e.message }));
    }
  }

  static async _applyAction({ request_id, actor_id, action, comment = "" }) {
    const request = await ApprovalRequestModel.findById(request_id);
    if (!request)                                    throw new Error("Approval request not found");
    if (request.status !== APPROVAL_STATUS.PENDING)  throw new Error(`Request already ${request.status}`);
    if (!request.required_approvers.includes(String(actor_id))) {
      throw new Error("You are not authorized to act on this request");
    }

    const actor     = await EmployeeModel.findById(actor_id).select("name email").lean().catch(() => null);
    const actorName = actor?.name || "";

    if (action === APPROVAL_STATUS.REJECTED) {
      request.status           = APPROVAL_STATUS.REJECTED;
      request.rejected_by      = String(actor_id);
      request.next_approver_id = "";
      request.completed_at     = new Date();
      request.approval_log.push({ action, actor_id: String(actor_id), actor_name: actorName, comment });
      await request.save();

      await AuditLogService.log({
        entity_type: "Approval",
        entity_id:   request._id,
        entity_no:   request.source_no,
        action:      AUDIT_ACTION.REJECT,
        actor_id:    String(actor_id),
        meta:        { reason: comment, source_type: request.source_type },
      }).catch(() => {}); // audit is best-effort

      // Fire on BOTH buses for back-compat (finance) and new consumers.
      emitFinanceEvent(FINANCE_EVENTS.APPROVAL_REJECTED, { source_no: request.source_no, source_type: request.source_type, actor_id });
      emitApprovalEvent(APPROVAL_EVENTS.REJECTED, {
        source_type: request.source_type, source_ref: String(request.source_ref),
        source_no: request.source_no, request_id: String(request._id), actor_id: String(actor_id), comment,
      });

      this._notifyInitiatorAsync({
        request, verdict: "rejected", actorName, comment,
      }).catch((err) => logger.warn({ context: "approval.reject.email", message: err.message }));

      return request;
    }

    if (action === APPROVAL_STATUS.APPROVED) {
      if (request.approved_by.includes(String(actor_id))) {
        throw new Error("You have already approved this request");
      }
      request.approved_by.push(String(actor_id));
      request.approval_log.push({ action, actor_id: String(actor_id), actor_name: actorName, comment });

      const doneAll = request.any_of
        ? true
        : request.required_approvers.every((a) => request.approved_by.includes(a));

      if (doneAll) {
        request.status           = APPROVAL_STATUS.APPROVED;
        request.next_approver_id = "";
        request.completed_at     = new Date();
      } else {
        const pending = request.required_approvers.find((a) => !request.approved_by.includes(a));
        request.next_approver_id = pending || "";
      }
      await request.save();

      if (doneAll) {
        await AuditLogService.log({
          entity_type: "Approval",
          entity_id:   request._id,
          entity_no:   request.source_no,
          action:      AUDIT_ACTION.APPROVE,
          actor_id:    String(actor_id),
          meta:        { source_type: request.source_type, amount: request.amount },
        }).catch(() => {});

        emitFinanceEvent(FINANCE_EVENTS.APPROVAL_APPROVED, {
          source_no: request.source_no, source_type: request.source_type,
          amount: request.amount, actor_id,
        });
        emitApprovalEvent(APPROVAL_EVENTS.APPROVED, {
          source_type: request.source_type, source_ref: String(request.source_ref),
          source_no: request.source_no, amount: request.amount,
          request_id: String(request._id), actor_id: String(actor_id),
        });

        this._notifyInitiatorAsync({
          request, verdict: "approved", actorName, comment,
        }).catch((err) => logger.warn({ context: "approval.approve.email", message: err.message }));
      }

      return request;
    }

    // plain comment
    request.approval_log.push({ action: "commented", actor_id: String(actor_id), actor_name: actorName, comment });
    await request.save();
    return request;
  }

  static async _notifyInitiatorAsync({ request, verdict, actorName, comment }) {
    const initiator = await EmployeeModel.findById(request.initiated_by).select("name email").lean();
    if (!initiator?.email) return;
    const isApproved = verdict === "approved";
    await _sendEmail({
      to:      initiator.email,
      subject: `${isApproved ? "Approved" : "Rejected"}: ${request.source_no || request.source_type}`,
      html: `
        <p>Hi ${initiator.name},</p>
        <p>Your <strong>${request.source_type}</strong> ${request.source_no ? `<strong>${request.source_no}</strong>` : ""}
        ${isApproved ? "has been" : "was"} <strong style="color:${isApproved ? "green" : "red"}">${verdict}</strong>.</p>
        ${isApproved ? "" : `<p>Reason: ${comment || "No reason provided"}</p>`}
        <p>${isApproved ? "Approved" : "Rejected"} by: ${actorName || "Team"}</p>
      `,
    });
  }

  static async approve({ request_id, actor_id, comment = "" }) {
    return this._applyAction({ request_id, actor_id, action: APPROVAL_STATUS.APPROVED, comment });
  }

  static async reject({ request_id, actor_id, comment = "" }) {
    return this._applyAction({ request_id, actor_id, action: APPROVAL_STATUS.REJECTED, comment });
  }

  static async comment({ request_id, actor_id, comment = "" }) {
    return this._applyAction({ request_id, actor_id, action: "commented", comment });
  }

  static async withdraw({ request_id, actor_id, comment = "" }) {
    const request = await ApprovalRequestModel.findById(request_id);
    if (!request)                                      throw new Error("Approval request not found");
    if (request.status !== APPROVAL_STATUS.PENDING)    throw new Error(`Request already ${request.status}`);
    if (request.initiated_by !== String(actor_id))     throw new Error("Only the initiator can withdraw");
    request.status       = "withdrawn";
    request.completed_at = new Date();
    request.approval_log.push({ action: "withdrawn", actor_id: String(actor_id), comment });
    await request.save();
    emitApprovalEvent(APPROVAL_EVENTS.WITHDRAWN, {
      source_type: request.source_type, source_ref: String(request.source_ref),
      source_no: request.source_no, request_id: String(request._id), actor_id: String(actor_id),
    });
    return request;
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  static async pendingForUser(user_id, { source_type, page = 1, limit = 20 } = {}) {
    const uid = String(user_id);
    const q = {
      status: "pending",
      $or: [
        { next_approver_id: uid },
        { required_approvers: uid, any_of: true },
      ],
    };
    if (source_type) q.source_type = source_type;
    const pg = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, parseInt(limit, 10));
    const skip = (pg - 1) * lim;
    const [rows, total] = await Promise.all([
      ApprovalRequestModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      ApprovalRequestModel.countDocuments(q),
    ]);
    return { total, page: pg, limit: lim, rows };
  }

  static async list({ source_type, status, page = 1, limit = 20 } = {}) {
    const q = { is_deleted: { $ne: true } };
    if (source_type) q.source_type = source_type;
    if (status)      q.status      = status;
    const pg = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, parseInt(limit, 10));
    const skip = (pg - 1) * lim;
    const [rows, total] = await Promise.all([
      ApprovalRequestModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      ApprovalRequestModel.countDocuments(q),
    ]);
    return { total, page: pg, limit: lim, rows };
  }

  static async getRequest(id) {
    const r = await ApprovalRequestModel.findById(id).lean();
    if (!r) throw new Error("Approval request not found");
    return r;
  }

  // ── Status helper for downstream services ─────────────────────────────────
  static async statusFor({ source_type, source_ref }) {
    const r = await ApprovalRequestModel.findOne({ source_type, source_ref })
      .select("status approved_by rejected_by next_approver_id completed_at")
      .lean();
    return r || null;
  }
}

export default ApprovalService;
