import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { fileURLToPath } from "url";
import ScheduleService from "./shedule.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadScheduleCSV = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { created_by_user, tender_id } = req.body;

    if (!created_by_user) {
      return res.status(400).json({ error: "created_by_user is required" });
    }

    if (!tender_id) {
      return res.status(400).json({ error: "tender_id is required" });
    }

    const csvRows = [];
    const filePath = path.join(__dirname, "../../../../uploads", req.file.filename);

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => {
        const trimmedRow = {};
        for (const [key, value] of Object.entries(row)) {
          trimmedRow[key.trim()] = typeof value === "string" ? value.trim() : value;
        }
        csvRows.push(trimmedRow);
      })
      .on("end", async () => {
        try {
          if (csvRows.length === 0) {
            return res.status(400).json({ error: "CSV file is empty" });
          }

          const result = await ScheduleService.bulkInsert(csvRows, created_by_user, tender_id);

          res.status(200).json({
            status: true,
            message: "Schedule created successfully",
            data: result,
          });
        } catch (error) {
          res.status(400).json({ status: false, error: error.message });
        } finally {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      })
      .on("error", (error) => {
        next(error);
      });
  } catch (error) {
    next(error);
  }
};

export const uploadScheduleDatesCSV = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { tender_id } = req.body;

    if (!tender_id) {
      return res.status(400).json({ error: "tender_id is required" });
    }

    const csvRows = [];
    const filePath = path.join(__dirname, "../../../../uploads", req.file.filename);

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => {
        const trimmedRow = {};
        for (const [key, value] of Object.entries(row)) {
          trimmedRow[key.trim()] = typeof value === "string" ? value.trim() : value;
        }
        csvRows.push(trimmedRow);
      })
      .on("end", async () => {
        try {
          if (csvRows.length === 0) {
            return res.status(400).json({ error: "CSV file is empty" });
          }

          const result = await ScheduleService.bulkUpdateSchedule(csvRows, tender_id);

          res.status(200).json({
            status: true,
            message: "Schedule dates and durations updated successfully",
            data: result,
          });
        } catch (error) {
          res.status(400).json({ status: false, error: error.message });
        } finally {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      })
      .on("error", (error) => {
        next(error);
      });
  } catch (error) {
    next(error);
  }
};

export const getSchedule = async (req, res, next) => {
    try {
        const { tender_id } = req.params;
        const schedule = await ScheduleService.getSchedule(tender_id);
        if (!schedule) return res.status(404).json({ error: "Schedule not found" });
        res.status(200).json({ status: true, message: "Success", data: schedule });
    } catch (error) {
        next(error);
    }
};

export const getScheduleforcsv = async (req, res, next) => {
    try {
        const { tender_id } = req.params;
        const data = await ScheduleService.getScheduleforcsv(tender_id);
        res.status(200).json({ status: true, message: "Success", data });
    } catch (error) {
        next(error);
    }
};  

export const getDailySchedule = async (req, res, next) => {
    try {
        const { tender_id } = req.params;
        const data = await ScheduleService.getDailySchedule(tender_id);
        res.status(200).json({ status: true, message: "Success", data });
    } catch (error) {
        next(error);
    }
};

// Main Update API
export const updateScheduleData = async (req, res) => {
    try {
        const { tender_id } = req.params;
        const payload = req.body;

        if (!tender_id) return res.status(400).json({ status: false, message: "Tender ID required" });
        
        // Basic validation
        if (!payload || (!payload.daily_updates && !payload.new_start_dates && !payload.revised_end_dates)) {
            return res.status(400).json({ status: false, message: "No update data provided" });
        }

        const updatedSchedule = await ScheduleService.updateSchedule(tender_id, payload);

        return res.status(200).json({
            status: true,
            message: "Schedule updated successfully",
            data: updatedSchedule
        });

    } catch (error) {
        console.error("Update Schedule Error:", error);
        return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
    }
};





