import UserAttendanceService from "./userAttendance.service.js";

export const performPunch = async (req, res) => {
  try {
    const data = await UserAttendanceService.performPunch(req.body);
    res.status(200).json({ success: true, message: "Check-In Successful", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

