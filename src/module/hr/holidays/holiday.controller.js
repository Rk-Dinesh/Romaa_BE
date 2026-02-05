import { parseFileToJson } from "../../../../utils/parseFileToJson.js";
import CalendarService from "./holiday.service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export const getHolidaysList = async (req, res) => {
  try {
    const { year } = req.query; // ?year=2026
    const result = await CalendarService.getHolidaysList(year || new Date().getFullYear());
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const bulkInsertHolidaysController = async (req, res, next) => {
  let filePath = null;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    filePath = path.join(
      __dirname,
      "../../../../uploads",
      req.file.filename,
    );

    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty" });
    }

    const result =
      await CalendarService.bulkInsertHolidaysFromCsv(
        dataRows,
      );
    res
      .status(200)
      .json({
        status: true,
        message: "CSV data uploaded successfully",
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