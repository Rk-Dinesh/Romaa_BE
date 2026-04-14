import LeaveService from "./leaverequest.service.js";
import LeaveBalanceHistoryService from "./leaveBalanceHistory.service.js";

export const applyLeave = async (req, res) => {
  try {
    // employeeId always comes from the verified JWT, not the request body
    const result = await LeaveService.applyLeave({ ...req.body, employeeId: req.user._id });
    res.status(201).json({ status: true, message: "Leave applied successfully", data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const actionLeave = async (req, res) => {
  try {
    // actionBy always comes from JWT; role & action come from body
    const result = await LeaveService.actionLeave({ ...req.body, actionBy: req.user._id });
    res.status(200).json({ status: true, message: `Leave ${req.body.action}d successfully`, data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const cancelLeave = async (req, res) => {
  try {
    // cancelledBy from JWT
    const result = await LeaveService.cancelLeave({ ...req.body, cancelledBy: req.user._id });
    res.status(200).json({ status: true, message: "Leave cancelled successfully", data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const getMyLeaves = async (req, res) => {
  try {
    const { status } = req.query;
    // Employees can view only their own; HR can pass ?userId= to view anyone's
    const employeeId = req.query.userId || req.user._id;
    const data = await LeaveService.getMyLeaves(employeeId, status);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getTeamLeaves = async (req, res) => {
  try {
    // Manager views their own team; HR can pass ?managerId= to view any manager's team
    const managerId = req.query.managerId || req.user._id;
    const data = await LeaveService.getPendingLeavesForManager(managerId);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// Employee or HR: leave balance transaction history
export const getBalanceHistory = async (req, res) => {
  try {
    // Employee views their own; HR can pass ?employeeId= to view anyone
    const employeeId = req.query.employeeId || req.user._id;
    const { leaveType, changeType, page, limit } = req.query;
    const data = await LeaveBalanceHistoryService.getHistory(employeeId, { leaveType, changeType, page, limit });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getYearlySummary = async (req, res) => {
  try {
    const employeeId = req.query.employeeId || req.user._id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const data = await LeaveBalanceHistoryService.getYearlySummary(employeeId, year);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// HR: get all pending/manager-approved leaves across the company
export const getAllPendingLeaves = async (req, res) => {
  try {
    const { status, page, limit, search } = req.query;
    const fromdate = req.query.fromdate || req.query.fromDate;
    const todate   = req.query.todate   || req.query.toDate;
    const result = await LeaveService.getAllPendingLeaves({ status, fromdate, todate, page, limit, search });
    res.status(200).json({
      status: true,
      currentPage: result.page,
      totalPages: Math.ceil(result.total / result.limit),
      totalCount: result.total,
      data: result.data,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
