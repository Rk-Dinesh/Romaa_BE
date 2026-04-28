import mongoose from "mongoose";
import MachineryAsset from "../machinery/machineryasset.model.js";
import FuelTelemetryService from "./fueltelemetry.service.js";

export const getLatestForAsset = async (req, res) => {
  try {
    const { assetId } = req.params;
    if (!mongoose.isValidObjectId(assetId)) {
      return res.status(400).json({ status: false, message: "Invalid assetId" });
    }
    const data = await FuelTelemetryService.getLatestForAsset(assetId);
    return res.status(200).json({ status: true, data });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

export const getHistory = async (req, res) => {
  try {
    const { assetId } = req.params;
    if (!mongoose.isValidObjectId(assetId)) {
      return res.status(400).json({ status: false, message: "Invalid assetId" });
    }
    const { from, to, eventType, limit } = req.query;
    const data = await FuelTelemetryService.getHistory({ assetId, from, to, eventType, limit });
    return res.status(200).json({ status: true, count: data.length, data });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

export const syncOneAsset = async (req, res) => {
  try {
    const { assetId } = req.params;
    if (!mongoose.isValidObjectId(assetId)) {
      return res.status(400).json({ status: false, message: "Invalid assetId" });
    }
    const asset = await MachineryAsset.findById(assetId);
    if (!asset) return res.status(404).json({ status: false, message: "Asset not found" });

    const result = await FuelTelemetryService.syncAsset(asset, { source: "MANUAL" });
    return res.status(200).json({ status: true, data: result });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

export const syncAllActive = async (req, res) => {
  try {
    const stats = await FuelTelemetryService.syncAllActive({ source: "MANUAL" });
    return res.status(200).json({ status: true, data: stats });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};
