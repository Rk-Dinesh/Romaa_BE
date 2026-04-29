import AppAuditLogModel from "./auditlog.model.js";
import logger from "../../config/logger.js";
import { getContext } from "../../common/requestContext.js";

// ── App Audit Service ────────────────────────────────────────────────────────
//
// Never throws. A failure here must never break the business operation it's
// logging. Call shape mirrors FinanceAuditService so UIs can read both stores
// without a mental model switch.

export default class AppAuditService {
  static async log({
    entity_type,
    entity_id,
    entity_no,
    action,
    actor_id,
    actor_name,
    changes,
    meta,
    correlation_id,
    ip_address,
    tenant_id,
  } = {}) {
    const ctx = getContext();
    try {
      await AppAuditLogModel.create({
        entity_type,
        entity_id:      entity_id || null,
        entity_no:      entity_no || "",
        action,
        actor_id:       actor_id   ?? ctx.userId   ?? null,
        actor_name:     actor_name || ctx.userName || "",
        changes:        changes || null,
        meta:           meta || null,
        correlation_id: correlation_id || ctx.correlationId || "",
        ip_address:     ip_address     || ctx.ipAddress     || "",
        tenant_id:      tenant_id      || ctx.tenantId      || "",
      });
    } catch (err) {
      logger.error({
        context: "AppAuditService.log",
        message: err.message,
        entity_type,
        entity_no,
        action,
      });
    }
  }

  // ── Query helpers ─────────────────────────────────────────────────────────
  static async getByEntity(entity_type, entity_id) {
    return AppAuditLogModel.find({ entity_type, entity_id })
      .sort({ createdAt: -1 })
      .lean();
  }

  static async getByActor(actor_id, { from_date, to_date, action } = {}) {
    const q = { actor_id };
    if (action) q.action = action;
    if (from_date || to_date) q.createdAt = {};
    if (from_date) q.createdAt.$gte = new Date(from_date);
    if (to_date)   q.createdAt.$lte = new Date(to_date);
    return AppAuditLogModel.find(q).sort({ createdAt: -1 }).limit(500).lean();
  }

  static async getAuditTrail({
    entity_type,
    action,
    from_date,
    to_date,
    actor_id,
    q: searchText,
    page = 1,
    limit = 50,
  } = {}) {
    const filter = {};
    if (entity_type) filter.entity_type = entity_type;
    if (action)      filter.action      = action;
    if (actor_id)    filter.actor_id    = actor_id;
    if (from_date || to_date) filter.createdAt = {};
    if (from_date)   filter.createdAt.$gte = new Date(from_date);
    if (to_date)     filter.createdAt.$lte = new Date(to_date);
    if (searchText) {
      const s = String(searchText).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { entity_no: { $regex: s, $options: "i" } },
        { actor_name: { $regex: s, $options: "i" } },
      ];
    }
    const pg = Math.max(1, parseInt(page, 10));
    const lim = Math.min(500, Math.max(1, parseInt(limit, 10)));
    const skip = (pg - 1) * lim;
    const [data, total] = await Promise.all([
      AppAuditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      AppAuditLogModel.countDocuments(filter),
    ]);
    return { data, pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } };
  }

  // Aggregated counts — used by the Settings > Audit overview tile.
  static async countsByEntityType({ from_date, to_date } = {}) {
    const match = {};
    if (from_date || to_date) match.createdAt = {};
    if (from_date) match.createdAt.$gte = new Date(from_date);
    if (to_date)   match.createdAt.$lte = new Date(to_date);
    return AppAuditLogModel.aggregate([
      { $match: match },
      { $group: { _id: { entity_type: "$entity_type", action: "$action" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
  }
}
