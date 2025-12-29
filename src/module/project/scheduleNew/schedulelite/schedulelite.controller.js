import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { fileURLToPath } from "url";
import ScheduleLiteService from "./schedulelite.service.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");


// Define __dirname for ES Modules
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

export const uploadScheduleCSV = async (req, res, next) => {
  let filePath = null;

  try {
    // 1. Basic Validation
    if (!req.file) {
      return res.status(400).json({ status: false, error: "No file uploaded" });
    }

    const { created_by_user, tender_id } = req.body;

    if (!tender_id) {
      return res.status(400).json({ status: false, error: "tender_id is required" });
    }

    // 2. Prepare File Path
    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);

    // 3. Parse File (Handles CSV/XLSX/XLS)
    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty" });
    }

    // 4. Call Service
    const result = await ScheduleLiteService.bulkInsert(dataRows, tender_id);

    res.status(200).json({
      status: true,
      message: "Schedule created successfully",
      data: result,
    });

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

export const uploadScheduleDatesCSV = async (req, res, next) => {
  let filePath = null;

  try {
    // 1. Basic Validation
    if (!req.file) {
      return res.status(400).json({ status: false, error: "No file uploaded" });
    }

    const { created_by_user, tender_id } = req.body;

    if (!tender_id) {
      return res.status(400).json({ status: false, error: "tender_id is required" });
    }

    // 2. Prepare File Path
    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);

    // 3. Parse File (Handles CSV/XLSX/XLS)
    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty" });
    }

    // 4. Call Service
    const result = await ScheduleLiteService.bulkUpdateScheduleStrict(dataRows, tender_id);

    res.status(200).json({
      status: true,
      message: "Schedule Updated successfully",
      data: result,
    });

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

export const getSchedule = async (req, res) => {
    try {
        const { tender_id } = req.params;

        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.getPopulatedSchedule(tender_id);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};

export const getAllSchedule = async (req, res) => {
    try {
        const { tender_id } = req.params;

        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.getPopulatedScheduleAll(tender_id);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};

export const updateRowSchedule = async (req, res) => {
    try {
        const { tender_id  } = req.params;
        const payload = req.body;


        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.updateRowSchedule(tender_id, payload);

        return res.status(200).json({
            status: true,
            data: data
        }); 

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};

export const updateDailyQuantity = async (req, res) => {
    try {
        const { tender_id  } = req.params;
        const payload = req.body;


        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.updateDailyQuantity(tender_id, payload);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};

export const updateDailyQuantityBulk = async (req, res) => {
    try {
        const { tender_id  } = req.params;
        const payload = req.body;


        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.bulkUpdateDailyQuantities(tender_id, payload);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};


