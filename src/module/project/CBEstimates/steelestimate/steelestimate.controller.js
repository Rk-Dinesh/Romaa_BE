
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
    if (!req.file) return res.status(400).json({ status: false, message: "No file uploaded. Please attach a CSV file and try again" });

    const { tender_id, bill_id, created_by_user } = req.body;
    if (!tender_id) return res.status(400).json({ status: false, message: "Tender ID is required to upload a steel estimate" });
    if (!bill_id)   return res.status(400).json({ status: false, message: "Bill ID is required to upload a steel estimate" });
    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);

    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, message: "The uploaded file contains no data. Please check the file and try again" });
    }

    const result = await SteelEstimateService.bulkInsert(dataRows, tender_id, bill_id, created_by_user);
    res.status(201).json({ status: true, message: "Steel estimate uploaded successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
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
    const tender_id = req.query.tender_id?.trim();
    const bill_id   = req.query.bill_id?.trim();
    if (!tender_id || !bill_id) return res.status(400).json({ status: false, message: "Tender ID and bill ID are required to retrieve the steel estimate" });
    const result = await SteelEstimateService.getDetailedSteelEstimate(tender_id, bill_id);
    if (!result) return res.status(404).json({ status: false, message: "Steel estimate not found. Please verify the tender ID and bill ID" });
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
