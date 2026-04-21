import ConsolidationService from "./consolidation.service.js";

export const entities = async (_req, res) => {
  try {
    const data = await ConsolidationService.entities();
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const trialBalance = async (req, res) => {
  try {
    const { as_of_date } = req.query;
    const data = await ConsolidationService.trialBalance({ as_of_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const pnl = async (req, res) => {
  try {
    const { financial_year, from_date, to_date } = req.query;
    const data = await ConsolidationService.pnl({ financial_year, from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const balanceSheet = async (req, res) => {
  try {
    const { as_of_date } = req.query;
    const data = await ConsolidationService.balanceSheet({ as_of_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const interEntity = async (req, res) => {
  try {
    const { financial_year, from_date, to_date } = req.query;
    const data = await ConsolidationService.interEntity({ financial_year, from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
