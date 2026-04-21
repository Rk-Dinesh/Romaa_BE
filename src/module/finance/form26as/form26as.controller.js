import Form26ASService from "./form26as.service.js";

const actorIdOf = (req) => String(req.user?._id || req.user?.id || "");

export const upload = async (req, res) => {
  try {
    const { entries } = req.body;
    const data = await Form26ASService.upload({ entries, user_id: actorIdOf(req) });
    res.status(201).json({ status: true, message: `Inserted ${data.inserted} of ${data.total_submitted} entries`, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const list = async (req, res) => {
  try {
    const { financial_year, quarter, deductor_tan } = req.query;
    const data = await Form26ASService.list({ financial_year, quarter, deductor_tan });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const reconcile = async (req, res) => {
  try {
    const { financial_year, quarter } = req.query;
    const data = await Form26ASService.reconcile({ financial_year, quarter });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const remove = async (req, res) => {
  try {
    const data = await Form26ASService.remove(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};
