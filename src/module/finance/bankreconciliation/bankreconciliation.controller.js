import BankReconciliationService from "./bankreconciliation.service.js";
import { paginatedResponse } from "../../../common/App.helperFunction.js";

// GET /bankreconciliation/next-no
export const getNextStatementNo = async (_req, res) => {
  try {
    const data = await BankReconciliationService.getNextStatementNo();
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// GET /bankreconciliation/list
export const getList = async (req, res) => {
  try {
    const { status, bank_account_code, statement_no, page, limit } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const result = await BankReconciliationService.getList({
      status, bank_account_code, statement_no, from_date, to_date, page, limit,
    });
    return paginatedResponse(res, {
      data:  result.data,
      page:  result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// GET /bankreconciliation/unreconciled
export const getUnreconciled = async (req, res) => {
  try {
    const { bank_account_code } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const data = await BankReconciliationService.getUnreconciledJELines({
      bank_account_code, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// GET /bankreconciliation/summary
export const getSummary = async (req, res) => {
  try {
    const { bank_account_code, as_of } = req.query;
    const data = await BankReconciliationService.getSummary({ bank_account_code, as_of });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// GET /bankreconciliation/:id
export const getById = async (req, res) => {
  try {
    const data = await BankReconciliationService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

// POST /bankreconciliation/create
export const create = async (req, res) => {
  try {
    const data = await BankReconciliationService.createStatement(req.body);
    res.status(201).json({ status: true, message: "Bank statement created", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// POST /bankreconciliation/:id/lines
export const appendLines = async (req, res) => {
  try {
    const data = await BankReconciliationService.appendLines(req.params.id, req.body.lines || []);
    res.status(200).json({ status: true, message: "Lines appended", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// POST /bankreconciliation/:id/auto-match
export const autoMatch = async (req, res) => {
  try {
    const data = await BankReconciliationService.autoMatch(req.params.id, {
      window_days: req.query.window_days || req.body?.window_days,
      matched_by:  req.user?.name || req.user?.employeeId || "auto",
    });
    res.status(200).json({ status: true, message: "Auto-match complete", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// PATCH /bankreconciliation/:id/lines/:lineId/match
export const manualMatch = async (req, res) => {
  try {
    const data = await BankReconciliationService.manualMatch(req.params.id, req.params.lineId, {
      ...req.body,
      matched_by: req.user?.name || req.user?.employeeId || req.body.matched_by || "",
    });
    res.status(200).json({ status: true, message: "Line matched", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// PATCH /bankreconciliation/:id/lines/:lineId/unmatch
export const unmatch = async (req, res) => {
  try {
    const data = await BankReconciliationService.unmatch(req.params.id, req.params.lineId);
    res.status(200).json({ status: true, message: "Line unmatched", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// PATCH /bankreconciliation/:id/lines/:lineId/ignore
export const ignoreLine = async (req, res) => {
  try {
    const data = await BankReconciliationService.ignoreLine(
      req.params.id,
      req.params.lineId,
      req.body.note || "",
    );
    res.status(200).json({ status: true, message: "Line marked as ignored", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// PATCH /bankreconciliation/:id/close
export const closeStatement = async (req, res) => {
  try {
    const data = await BankReconciliationService.closeStatement(
      req.params.id,
      req.user?.name || req.user?.employeeId || "",
    );
    res.status(200).json({ status: true, message: "Statement closed", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// DELETE /bankreconciliation/:id
export const remove = async (req, res) => {
  try {
    const data = await BankReconciliationService.deleteStatement(req.params.id);
    res.status(200).json({ status: true, message: "Statement deleted", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
