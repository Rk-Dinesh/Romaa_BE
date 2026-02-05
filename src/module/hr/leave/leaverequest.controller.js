import LeaveService from "./leaverequest.service.js";

export const applyLeave = async (req, res) => {
  try {
    const result = await LeaveService.applyLeave(req.body);
    res.status(201).json({ success: true, message: "Leave applied successfully", data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

export const actionLeave = async (req, res) => {
  try {
    // Expected body: { leaveRequestId, actionBy: "MANAGER_ID", role: "Manager", action: "Approve", remarks: "OK" }
    const result = await LeaveService.actionLeave(req.body);
    res.status(200).json({ success: true, message: `Leave ${req.body.action}d successfully`, data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

export const cancelLeave = async (req, res) => {
  try {
    const result = await LeaveService.cancelLeave(req.body);
    res.status(200).json({ success: true, message: "Leave cancelled successfully", data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

export const getMyLeaves = async (req, res) => {
  try {
    const { employeeId, status } = req.query; 
    const data = await LeaveService.getMyLeaves(employeeId, status);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getTeamLeaves = async (req, res) => {
  try {
    const { managerId } = req.query;
    const data = await LeaveService.getPendingLeavesForManager(managerId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};