
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import SteelEstimateService from "./steelEstimate.service.js";
import { parseFileToJson } from "../../../../../utils/parseFileToJson.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export const uploadBillingEstimateCSV = async (req, res, next) => {

  let filePath = null;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { tender_id, bill_id, user_sequence, abstract_name, created_by_user } = req.body;
    if (!tender_id) return res.status(400).json({ error: "tender_id is required" });
    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);

    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty" });
    }

    const result = await SteelEstimateService.bulkInsert(dataRows, tender_id, bill_id, user_sequence, abstract_name, created_by_user);
    res.status(200).json({ status: true, message: "CSV data uploaded successfully", data: result });
  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
  } finally {
    // 5. Cleanup: Delete file after processing
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupErr) {
        console.error("Error deleting file:", cleanupErr);
      }
    }
  }
};

export const getDetailedSteelEstimate = async (req, res, next) => {
  try {
    const { tender_id, bill_id, abstract_name, bill_sequence } = req.params;
    if (!tender_id || !bill_id || !abstract_name || !bill_sequence) return res.status(400).json({ error: "Missing required parameters" });
    const result = await SteelEstimateService.getDetailedSteelEstimate(tender_id, bill_id, abstract_name, bill_sequence);
    res.status(200).json({ status: true, message: "Detailed bill fetched successfully", data: result });
  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
  }
};


