import UserAttendanceService from "./userAttendance.service.js";

export const markCheckIn = async (req, res) => {
  try {
    const data = await UserAttendanceService.performCheckIn(req.body);
    res.status(200).json({ success: true, message: "Check-In Successful", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

export const markCheckOut = async (req, res) => {
  try {
    const data = await UserAttendanceService.performCheckOut(req.body);
    res.status(200).json({ success: true, message: "Check-Out Successful", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

export const raiseRegularization = async (req, res) => {
  try {
    const result = await UserAttendanceService.raiseRegularization(req.body);
    res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

export const actionRegularization = async (req, res) => {
  try {
    const result = await UserAttendanceService.actionRegularization(req.body);
    res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// --- History ---
export const getMyAttendance = async (req, res) => {
  try {
    const { employeeId, month, year } = req.query; // pass via query params

    if (!employeeId || !month || !year) {
      return res.status(400).json({ success: false, message: "Missing required params: employeeId, month, year" });
    }

    const data = await UserAttendanceService.getMonthlyAttendance(employeeId, parseInt(month), parseInt(year));
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getLiveTeamDashboard = async (req, res) => {
  try {
    const { managerId } = req.query; // e.g., ?managerId=...
    const data = await UserAttendanceService.getLiveTeamStatus(managerId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};