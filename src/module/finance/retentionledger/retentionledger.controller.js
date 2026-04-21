import RetentionLedgerService from "./retentionledger.service.js";

export const getPayableOutstanding = async (req, res) => {
  try {
    const { party_id, tender_id } = req.query;
    const data = await RetentionLedgerService.getPayableOutstanding({ party_id, tender_id });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getReceivableOutstanding = async (req, res) => {
  try {
    const { party_id, tender_id } = req.query;
    const data = await RetentionLedgerService.getReceivableOutstanding({ party_id, tender_id });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getSummary = async (req, res) => {
  try {
    const { tender_id } = req.query;
    const data = await RetentionLedgerService.getSummary({ tender_id });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const createRelease = async (req, res) => {
  try {
    const data = await RetentionLedgerService.createRelease({
      ...req.body,
      created_by: req.user?._id || null,
    });
    res.status(201).json({ status: true, message: "Retention release created (pending)", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const approveRelease = async (req, res) => {
  try {
    const data = await RetentionLedgerService.approveRelease({
      id: req.params.id,
      approved_by: req.user?._id || null,
    });
    res.status(200).json({ status: true, message: "Retention release approved", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const cancelRelease = async (req, res) => {
  try {
    const data = await RetentionLedgerService.cancelRelease({
      id: req.params.id,
      reason: req.body?.reason || "",
      cancelled_by: req.user?._id || null,
    });
    res.status(200).json({ status: true, message: "Retention release cancelled", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const listReleases = async (req, res) => {
  try {
    const data = await RetentionLedgerService.list(req.query);
    res.status(200).json({ status: true, ...data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getReleaseById = async (req, res) => {
  try {
    const data = await RetentionLedgerService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const getReleasesForBill = async (req, res) => {
  try {
    const { bill_type } = req.query;
    const data = await RetentionLedgerService.getReleasesForBill({
      bill_type,
      bill_id: req.params.id,
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
