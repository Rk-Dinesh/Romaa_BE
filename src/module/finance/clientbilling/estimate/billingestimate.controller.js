import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import BillingEstimateService from "./billingestimate.service.js";
import { parseFileToJson } from "../../../../../utils/parseFileToJson.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const uploadBillingEstimateCSV = async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) return res.status(400).json({ status: false, message: "No file uploaded" });

    const { tender_id, bill_id, abstract_name, created_by_user } = req.body;
    if (!tender_id)    return res.status(400).json({ status: false, message: "tender_id is required" });
    if (!bill_id)      return res.status(400).json({ status: false, message: "bill_id is required — create the client bill first" });
    if (!abstract_name) return res.status(400).json({ status: false, message: "abstract_name is required" });

    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);
    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (!dataRows.length) return res.status(400).json({ status: false, message: "File is empty" });

    const result = await BillingEstimateService.bulkInsert(
      dataRows, tender_id, bill_id, abstract_name, created_by_user
    );
    res.status(200).json({ status: true, message: "Estimate uploaded successfully", data: result });

  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  }
};

export const getDetailedBill = async (req, res) => {
  try {
    const { tender_id, bill_id, abstract_name, bill_sequence } = req.params;
    if (!tender_id || !bill_id || !abstract_name || !bill_sequence) {
      return res.status(400).json({ status: false, message: "Missing required parameters" });
    }
    const data = await BillingEstimateService.getDetailedBill(tender_id, bill_id, abstract_name, bill_sequence);
    if (!data) return res.status(404).json({ status: false, message: "Estimate not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getEstimatesForBill = async (req, res) => {
  try {
    const { tender_id, bill_id } = req.params;
    const data = await BillingEstimateService.getEstimatesForBill(tender_id, bill_id);
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
