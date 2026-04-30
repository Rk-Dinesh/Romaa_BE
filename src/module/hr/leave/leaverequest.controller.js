import LeaveService from "./leaverequest.service.js";
import LeaveBalanceHistoryService from "./leaveBalanceHistory.service.js";
import { uploadFileToS3 } from "../../../../utils/awsBucket.js";

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

// A2: Withdraw — only valid pre-approval, no balance refund.
export const withdrawLeave = async (req, res) => {
  try {
    const result = await LeaveService.withdrawLeave({ ...req.body, withdrawnBy: req.user._id });
    res.status(200).json({ status: true, message: result.message });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

// A6: Bulk approve/reject
export const bulkActionLeave = async (req, res) => {
  try {
    const { leaveRequestIds, role, action, remarks } = req.body;
    const data = await LeaveService.bulkActionLeave({
      leaveRequestIds, actionBy: req.user._id, role, action, remarks,
    });
    res.status(200).json({
      status: true,
      message: `Bulk action complete: ${data.processed.length} processed, ${data.failed.length} failed`,
      data,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

// A7: Aggregated approval queue for the caller
export const getMyPendingApprovals = async (req, res) => {
  try {
    const data = await LeaveService.getMyPendingApprovals(req.user._id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
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

// History — manager (scope=team) or HR-wide (scope=all)
// G2: scope=all is gated by hr.leave.read. Otherwise we down-scope to "team"
// auto-using the caller's _id as managerId so the response can never spill
// outside their direct + delegated reports.
export const getLeaveHistory = async (req, res) => {
  try {
    const RoleModel = (await import("../../role/role.model.js")).default;
    let { scope, status, page, limit, search, leaveType } = req.query;
    const fromdate = req.query.fromdate || req.query.fromDate;
    const todate   = req.query.todate   || req.query.toDate;

    // Resolve caller's HR permission once
    let hasHRRead = false;
    if (req.user?.role) {
      const role = await RoleModel.findById(req.user.role).lean();
      hasHRRead = !!role?.permissions?.hr?.leave?.read;
    }

    if (!scope || scope === "all") {
      // Default scope depends on permission
      scope = hasHRRead ? "all" : "team";
    } else if (scope === "all" && !hasHRRead) {
      return res.status(403).json({ status: false, message: "Not authorized to view all-employee leave history" });
    }

    const managerId = req.query.managerId
      || (scope === "team" ? req.user._id : undefined);

    const result = await LeaveService.getLeaveHistory({
      scope, managerId, status, fromdate, todate, page, limit, search, leaveType,
    });
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

// Leave attachment upload — multipart/form-data {file}
// Returns a public S3 URL the frontend then sets on `attachmentUrl` when applying.
export const uploadLeaveAttachment = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: false, message: "No file uploaded" });
  }
  // 5 MB cap to keep S3 costs sane
  if (req.file.size > 5 * 1024 * 1024) {
    return res.status(400).json({ status: false, message: "File size exceeds 5MB limit" });
  }
  try {
    const upload = await uploadFileToS3(req.file, process.env.AWS_S3_BUCKET);
    const fileUrl = `https://${upload.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${upload.Key}`;
    res.status(200).json({ status: true, message: "File uploaded", fileUrl });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// HR: grant a life-event leave (Maternity / Paternity / Bereavement)
export const grantEventLeave = async (req, res) => {
  try {
    const data = await LeaveService.grantEventLeave({
      ...req.body,
      recordedBy: req.user._id,
    });
    res.status(201).json({ status: true, message: "Leave granted", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
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
