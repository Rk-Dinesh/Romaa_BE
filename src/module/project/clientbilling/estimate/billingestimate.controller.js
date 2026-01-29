
import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { fileURLToPath } from 'url';
import { createRequire } from "module";
import BillingEstimateService from "./billingestimate.service.js";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parseFileToJson = (filePath, originalName) => {
  return new Promise((resolve, reject) => {
    const ext = path.extname(originalName).toLowerCase();
    const rows = [];

    // CASE 1: Excel Files (.xlsx, .xls)
    if (ext === ".xlsx" || ext === ".xls") {
      try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Read first sheet
        const sheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const rawData = XLSX.utils.sheet_to_json(sheet);

        // Normalize Keys (Trim spaces)
        const cleanedData = rawData.map(row => {
          const newRow = {};
          for (const [key, value] of Object.entries(row)) {
            newRow[key.trim()] = value;
          }
          return newRow;
        });

        resolve(cleanedData);
      } catch (err) {
        reject(err);
      }
    }
    // CASE 2: CSV Files
    else if (ext === ".csv") {
      fs.createReadStream(filePath)
        .pipe(csvParser({
          mapHeaders: ({ header }) => header.trim()
        }))
        .on("data", (row) => {
          const trimmedRow = {};
          for (const [key, value] of Object.entries(row)) {
            const cleanKey = key.trim().replace(/^\uFEFF/, ''); // Remove BOM
            trimmedRow[cleanKey] = typeof value === "string" ? value.trim() : value;
          }
          rows.push(trimmedRow);
        })
        .on("end", () => resolve(rows))
        .on("error", (error) => reject(error));
    }
    // CASE 3: Unsupported
    else {
      reject(new Error("Unsupported file type. Please upload .csv, .xlsx, or .xls"));
    }
  });
};

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

    const result = await BillingEstimateService.bulkInsert(dataRows, tender_id, bill_id, user_sequence, abstract_name, created_by_user);
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
    const { tender_id, bill_id, abstract_name, bill_sequence } = req.params;
    if (!tender_id || !bill_id || !abstract_name || !bill_sequence) return res.status(400).json({ error: "Missing required parameters" });
    const result = await BillingEstimateService.getDetailedBill(tender_id, bill_id, abstract_name, bill_sequence);
    res.status(200).json({ status: true, message: "Detailed bill fetched successfully", data: result });
  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
  }
};


