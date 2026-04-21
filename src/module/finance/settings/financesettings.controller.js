import FinanceSettingsService from "./financesettings.service.js";

// GET /finance/settings
export const getAllSettings = async (req, res) => {
  try {
    const data = await FinanceSettingsService.getAll();
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// PUT /finance/settings/:key
export const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ status: false, message: "value is required" });
    }

    const doc = await FinanceSettingsService.set(key, value, req.user?._id, description || "");
    res.status(200).json({ status: true, data: doc });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
