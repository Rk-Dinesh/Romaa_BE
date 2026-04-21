import BudgetService from "./budget.service.js";
import { paginatedResponse } from "../../../common/App.helperFunction.js";

export const create = async (req, res) => {
  try {
    const data = await BudgetService.create({
      ...req.body,
      created_by: req.user?.name || req.user?.employeeId || req.body.created_by || "",
    });
    res.status(201).json({ status: true, message: "Budget created", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const getList = async (req, res) => {
  try {
    const { tender_id, financial_year, status, page, limit } = req.query;
    const result = await BudgetService.getList({ tender_id, financial_year, status, page, limit });
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

export const getById = async (req, res) => {
  try {
    const data = await BudgetService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const update = async (req, res) => {
  try {
    const data = await BudgetService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Budget updated", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const approve = async (req, res) => {
  try {
    const data = await BudgetService.approve(
      req.params.id,
      req.user?.name || req.user?.employeeId || "",
    );
    res.status(200).json({ status: true, message: "Budget approved", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const archive = async (req, res) => {
  try {
    const data = await BudgetService.archive(req.params.id);
    res.status(200).json({ status: true, message: "Budget archived", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const remove = async (req, res) => {
  try {
    const data = await BudgetService.remove(req.params.id);
    res.status(200).json({ status: true, message: "Budget deleted", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const variance = async (req, res) => {
  try {
    const data = await BudgetService.varianceReport(req.params.id, { as_of: req.query.as_of });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const varianceByTender = async (req, res) => {
  try {
    const data = await BudgetService.varianceByTender({
      tender_id:      req.query.tender_id,
      financial_year: req.query.financial_year,
      as_of:          req.query.as_of,
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
