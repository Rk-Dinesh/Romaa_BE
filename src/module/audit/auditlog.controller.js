import AppAuditService from "./auditlog.service.js";
import { runAllAuditArchives } from "./auditlog.retention.js";

const actorIdOf = (req) => String(req.user?._id || req.user?.id || "");

export const getAuditTrail = async (req, res) => {
  try {
    const { entity_type, action, actor_id, from_date, to_date, q, page, limit } = req.query;
    const result = await AppAuditService.getAuditTrail({
      entity_type,
      action,
      actor_id,
      from_date,
      to_date,
      q,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
    res.status(200).json({ status: true, ...result });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getEntityAuditTrail = async (req, res) => {
  try {
    const { entity_type, entity_id } = req.params;
    const data = await AppAuditService.getByEntity(entity_type, entity_id);
    res.status(200).json({ status: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getMyAuditTrail = async (req, res) => {
  try {
    const { from_date, to_date, action } = req.query;
    const data = await AppAuditService.getByActor(actorIdOf(req), { from_date, to_date, action });
    res.status(200).json({ status: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getAuditCounts = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const data = await AppAuditService.countsByEntityType({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const runRetentionNow = async (req, res) => {
  try {
    const { retention_days } = req.body;
    const days = retention_days ? Number(retention_days) : undefined;
    const result = await runAllAuditArchives({ retention_days: days });
    res.status(200).json({ status: true, message: "Archive completed", data: result });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
