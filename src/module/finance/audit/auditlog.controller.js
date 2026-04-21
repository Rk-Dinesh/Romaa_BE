import AuditLogService from "./auditlog.service.js";

export const getAuditTrail = async (req, res) => {
  try {
    const { entity_type, action, from_date, to_date, actor_id, page, limit } = req.query;
    const result = await AuditLogService.getFinanceAuditTrail({
      entity_type, action, actor_id,
      from_date, to_date,
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
    const data = await AuditLogService.getByEntity(entity_type, entity_id);
    res.status(200).json({ status: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
