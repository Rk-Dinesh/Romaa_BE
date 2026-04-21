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

// GET /ledger-seal/verify-seq?from=1&to=100
// Pure chain-hash walk (does not re-check JE content — use /verify for that).
export const verifyBySequence = async (req, res) => {
  try {
    const fromSeq = req.query.from ? parseInt(req.query.from, 10) : 1;
    const toSeq   = req.query.to   ? parseInt(req.query.to, 10)   : null;
    if (isNaN(fromSeq) || fromSeq < 1) {
      return res.status(400).json({ status: false, message: "'from' must be a positive integer" });
    }
    const data = await LedgerSealService.verifyBySequence(fromSeq, toSeq);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// GET /ledger-seal/:sequence — fetch a single seal by sequence number
export const getBySequence = async (req, res) => {
  try {
    const data = await LedgerSealService.getBySequence(req.params.sequence);
    res.status(200).json({ status: true, data });
  } catch (err) {
    const status = err.message.startsWith("No seal") ? 404 : 500;
    res.status(status).json({ status: false, message: err.message });
  }
};
