import AssetCalibrationService from "./assetcalibration.service.js";

export const createCalibration = async (req, res) => {
  try {
    const result = await AssetCalibrationService.createCalibration(req.body, req.user?._id);
    res.status(201).json({ status: true, message: "Calibration recorded", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getAllCalibrations = async (req, res) => {
  try {
    const result = await AssetCalibrationService.getAll(req.query);
    res.status(200).json({ status: true, data: result.data, meta: result.meta });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getCalibrationById = async (req, res) => {
  try {
    const result = await AssetCalibrationService.getByCalibrationId(req.params.calibrationId);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const getCalibrationHistoryForAsset = async (req, res) => {
  try {
    const result = await AssetCalibrationService.getHistoryForAsset(req.params.assetIdLabel);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateCalibration = async (req, res) => {
  try {
    const result = await AssetCalibrationService.update(req.params.calibrationId, req.body, req.user?._id);
    res.status(200).json({ status: true, message: "Calibration updated", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const deleteCalibration = async (req, res) => {
  try {
    await AssetCalibrationService.deleteCalibration(req.params.calibrationId, req.user?._id);
    res.status(200).json({ status: true, message: "Calibration deleted" });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getCalibrationDueReport = async (req, res) => {
  try {
    const days = req.query.days || 30;
    const result = await AssetCalibrationService.getDueReport(days);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
