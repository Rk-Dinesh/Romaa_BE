import AuditLogModel from "./auditlog.model.js";
import logger from "../../../config/logger.js";
import { getContext } from "../../../common/requestContext.js";

export default class AuditLogService {

  static async log({ entity_type, entity_id, entity_no, action, actor_id, actor_name, changes, meta, correlation_id, ip_address } = {}) {
    const ctx = getContext();
    try {
      await AuditLogModel.create({
        entity_type, entity_id, entity_no: entity_no || "",
        action, actor_id: actor_id ?? ctx.userId ?? null, actor_name: actor_name || ctx.userName || "",
        changes: changes || null, meta: meta || null,
        correlation_id: correlation_id || ctx.correlationId || "",
        ip_address:     ip_address     || ctx.ipAddress     || "",
      });
    } catch (err) {
      // Never fail the main operation because of audit log failure
      logger.error({ context: "AuditLogService.log", message: err.message, entity_type, entity_no, action });
    }
  }

  static async getByEntity(entity_type, entity_id) {
    return AuditLogModel.find({ entity_type, entity_id }).sort({ createdAt: -1 }).lean();
  }

  static async getByActor(actor_id, { from_date, to_date, action } = {}) {
    const q = { actor_id };
    if (action) q.action = action;
    if (from_date || to_date) q.createdAt = {};
    if (from_date) q.createdAt.$gte = new Date(from_date);
    if (to_date) q.createdAt.$lte = new Date(to_date);
    return AuditLogModel.find(q).sort({ createdAt: -1 }).limit(500).lean();
  }

  static async getFinanceAuditTrail({ entity_type, action, from_date, to_date, actor_id, page = 1, limit = 50 } = {}) {
    const q = {};
    if (entity_type) q.entity_type = entity_type;
    if (action) q.action = action;
    if (actor_id) q.actor_id = actor_id;
    if (from_date || to_date) q.createdAt = {};
    if (from_date) q.createdAt.$gte = new Date(from_date);
    if (to_date) q.createdAt.$lte = new Date(to_date);
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      AuditLogModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLogModel.countDocuments(q),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
}
