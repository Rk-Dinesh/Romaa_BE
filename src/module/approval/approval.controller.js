import ApprovalService from "./approval.service.js";

const actorIdOf = (req) => String(req.user?._id || req.user?.id || "");

export const upsertRule = async (req, res) => {
  try {
    const { source_type, module_label, amount_field, thresholds, is_active } = req.body;
    const rule = await ApprovalService.upsertRule({
      source_type,
      module_label,
      amount_field,
      thresholds,
      is_active,
      user_id: actorIdOf(req),
    });
    res.status(200).json({ status: true, message: "Rule saved", data: rule });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const listRules = async (req, res) => {
  try {
    const { source_type } = req.query;
    const data = await ApprovalService.listRules({ source_type });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getRule = async (req, res) => {
  try {
    const data = await ApprovalService.getRule(req.params.source_type);
    if (!data) return res.status(404).json({ status: false, message: "Rule not found" });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const deleteRule = async (req, res) => {
  try {
    const data = await ApprovalService.deleteRule(req.params.source_type, actorIdOf(req));
    res.status(200).json({ status: true, message: "Rule deactivated", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const simulate = async (req, res) => {
  try {
    const { source_type, amount } = req.body;
    const initiator_id = req.body.initiator_id || actorIdOf(req);
    const result = await ApprovalService.simulate({ source_type, amount, initiator_id });
    res.status(200).json({ status: true, data: result });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const initiate = async (req, res) => {
  try {
    const { source_type, source_ref, source_no, amount, narration } = req.body;
    const result = await ApprovalService.initiate({
      source_type,
      source_ref,
      source_no,
      amount,
      narration,
      initiator_id: actorIdOf(req),
    });
    res.status(201).json({ status: true, data: result });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const approve = async (req, res) => {
  try {
    const { comment } = req.body;
    const data = await ApprovalService.approve({
      request_id: req.params.id,
      actor_id:   actorIdOf(req),
      comment,
    });
    res.status(200).json({ status: true, message: "Approved", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const reject = async (req, res) => {
  try {
    const { comment } = req.body;
    const data = await ApprovalService.reject({
      request_id: req.params.id,
      actor_id:   actorIdOf(req),
      comment,
    });
    res.status(200).json({ status: true, message: "Rejected", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const comment = async (req, res) => {
  try {
    const { comment: text } = req.body;
    const data = await ApprovalService.comment({
      request_id: req.params.id,
      actor_id:   actorIdOf(req),
      comment:    text,
    });
    res.status(200).json({ status: true, message: "Commented", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const withdraw = async (req, res) => {
  try {
    const { comment: text } = req.body;
    const data = await ApprovalService.withdraw({
      request_id: req.params.id,
      actor_id:   actorIdOf(req),
      comment:    text,
    });
    res.status(200).json({ status: true, message: "Withdrawn", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const pendingForMe = async (req, res) => {
  try {
    const { source_type, page, limit } = req.query;
    const data = await ApprovalService.pendingForUser(actorIdOf(req), { source_type, page, limit });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const list = async (req, res) => {
  try {
    const { source_type, status, page, limit } = req.query;
    const data = await ApprovalService.list({ source_type, status, page, limit });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getRequest = async (req, res) => {
  try {
    const data = await ApprovalService.getRequest(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};
