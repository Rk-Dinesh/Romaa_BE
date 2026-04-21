import LedgerSealService from "./ledgerseal.service.js";

export const sealApproved = async (_req, res) => {
  try {
    const data = await LedgerSealService.sealApproved();
    res.status(200).json({ status: true, message: `Sealed ${data.added} journal entries`, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const verify = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const data = await LedgerSealService.verify({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const status = async (_req, res) => {
  try {
    const data = await LedgerSealService.status();
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const list = async (req, res) => {
  try {
    const { page, limit, from_date, to_date } = req.query;
    const data = await LedgerSealService.list({ page, limit, from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
