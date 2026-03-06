import DashboardService from "./dashboard.service.js";

export const getDashboard = async (req, res) => {
  try {
    const data = await DashboardService.getDashboard(req.user);
    return res.status(200).json({ status: true, data });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
