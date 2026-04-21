import YearEndCloseService from "./yearendclose.service.js";

const actorIdOf = (req) => String(req.user?._id || req.user?.id || "");

export const preview = async (req, res) => {
  try {
    const financial_year = req.query.financial_year || req.params.financial_year;
    const data = await YearEndCloseService.preview({ financial_year });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const closeFY = async (req, res) => {
  try {
    const { financial_year, retained_earnings_code, force } = req.body;
    const data = await YearEndCloseService.closeFY({
      financial_year,
      retained_earnings_code,
      user_id: actorIdOf(req),
      force: !!force,
    });
    res.status(200).json({ status: true, message: "FY closed", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const reopen = async (req, res) => {
  try {
    const { financial_year, reason } = req.body;
    const data = await YearEndCloseService.reopen({
      financial_year,
      user_id: actorIdOf(req),
      reason,
    });
    res.status(200).json({ status: true, message: "FY reopened", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const openingBalances = async (req, res) => {
  try {
    const financial_year = req.query.financial_year || req.params.financial_year;
    const data = await YearEndCloseService.openingBalances(financial_year);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const list = async (_req, res) => {
  try {
    const data = await YearEndCloseService.list();
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getOne = async (req, res) => {
  try {
    const data = await YearEndCloseService.get(req.params.financial_year);
    if (!data) return res.status(404).json({ status: false, message: "No close record for that FY" });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
