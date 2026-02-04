import CalendarService from "./holiday.service.js";


export const addHoliday = async (req, res) => {
  try {
    const result = await CalendarService.addHoliday(req.body);
    res.status(201).json({ success: true, message: "Holiday added", data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

export const getHolidays = async (req, res) => {
  try {
    const { year } = req.query; // ?year=2026
    const result = await CalendarService.getHolidays(year || new Date().getFullYear());
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};