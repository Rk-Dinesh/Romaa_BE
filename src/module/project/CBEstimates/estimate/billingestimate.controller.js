
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import BillingEstimateService from "./billingestimate.service.js";
import { parseFileToJson } from "../../../../../utils/parseFileToJson.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export const uploadBillingEstimateCSV = async (req, res, next) => {

  let filePath = null;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { tender_id, bill_id, created_by_user } = req.body;
    if (!tender_id || !bill_id) return res.status(400).json({ error: "tender_id and bill_id are required" });
    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);

    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty" });
    }

    const result = await BillingEstimateService.bulkInsert(dataRows, tender_id, bill_id, created_by_user);
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

export const getDetailedBill = async (req, res, next) => {
  try {
    const tender_id = req.query.tender_id?.trim();
    const bill_id   = req.query.bill_id?.trim();
    if (!tender_id || !bill_id) return res.status(400).json({ status: false, error: "tender_id and bill_id are required" });
    const result = await BillingEstimateService.getDetailedBill(tender_id, bill_id);
    if (!result) return res.status(404).json({ status: false, error: "Bill not found" });
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
};