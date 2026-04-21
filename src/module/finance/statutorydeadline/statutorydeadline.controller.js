import StatutoryDeadlineService from "./statutorydeadline.service.js";

export const calendar = async (req, res) => {
  try {
    const { financial_year } = req.query;
    const data = await StatutoryDeadlineService.calendar({ financial_year });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const upcoming = async (req, res) => {
  try {
    const { as_of, window_days } = req.query;
    const data = await StatutoryDeadlineService.upcoming({
      as_of,
      window_days: window_days ? parseInt(window_days, 10) : 60,
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const markFiled = async (req, res) => {
  try {
    const data = await StatutoryDeadlineService.markFiled({
      ...req.body,
      user_id: String(req.user?._id || req.user?.id || ""),
    });
    res.status(201).json({ status: true, message: "Filing recorded", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const listFilings = async (req, res) => {
  try {
    const data = await StatutoryDeadlineService.listFilings(req.query);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const unfile = async (req, res) => {
  try {
    const data = await StatutoryDeadlineService.unfile(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
