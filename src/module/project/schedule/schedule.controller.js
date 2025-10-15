import ScheduleService from "./shedule.service.js";
import csvParser from "csv-parser";
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeekRangeOfMonth, monthsMap } from "../../../../utils/helperfunction.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadScheduleCSV = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const { workOrderDate, aggDate, agreementValue, projectEndDate, plannedCompletionDate, reportDate, projectName, tenderId } = req.body;
        if (!workOrderDate) return res.status(400).json({ error: "workOrderDate is required" });
        if (!agreementValue) return res.status(400).json({ error: "agreementValue is required" });
        if (!projectEndDate) return res.status(400).json({ error: "projectEndDate is required" });
        if (!projectName) return res.status(400).json({ error: "projectName is required" });
        if (!tenderId) return res.status(400).json({ error: "tenderId is required" });

        console.log(req.body, req.file  );
        

        const csvRows = [];
        const filePath = path.join(__dirname, "../../../../uploads", req.file.filename);

        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on("data", (row) => csvRows.push(row))
            .on("end", async () => {
                try {
                    const schedule = await ScheduleService.bulkInsertSchedule(csvRows, req.body);
                    res.status(200).json({ status: true, message: "Schedule data uploaded successfully", data: schedule });
                } catch (err) {
                    next(err);
                } finally {
                    fs.unlinkSync(filePath);
                }
            });
    } catch (err) {
        next(err);
    }
};

export const updateScheduleReportDate = async (req, res, next) => {
  try {
    const { tenderId, reportDate } = req.body;
    if (!tenderId || !reportDate) {
      return res.status(400).json({ error: "tenderId and reportDate are required" });
    }
    const schedule = await ScheduleService.updateReportDateAndDaysRemaining(tenderId, reportDate);
    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    res.json({
      status: true,
      message: "Report date updated and daysRemaining recalculated successfully",
      data: schedule,
    });
  } catch (err) {
    next(err);
  }
};

export const getSchedules = async (req, res, next) => {
  try {
    const { tenderId, week, month, year, particularDate, startDate, endDate } = req.query;

    if (!tenderId)
      return res.status(400).json({ error: "tenderId query param is required" });

    let dateFilter = null;
    const selectedYear = year ? parseInt(year) : new Date().getFullYear();

    if (week && month && year) {
      const monthIdx = monthsMap[month.toLowerCase()];
      const { start, end } = getWeekRangeOfMonth(week, selectedYear, monthIdx);
      dateFilter = { $gte: start, $lte: end };
    } else if (month && year) {
      const monthIdx = monthsMap[month.toLowerCase()];
      const start = new Date(selectedYear, monthIdx, 1);
      const end = new Date(selectedYear, monthIdx + 1, 0);
      dateFilter = { $gte: start, $lte: end };
    } else if (startDate && endDate) {
      dateFilter = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else if (particularDate) {
      dateFilter = new Date(particularDate);
    } else if (year) {
      const start = new Date(selectedYear, 0, 1);
      const end = new Date(selectedYear, 11, 31);
      dateFilter = { $gte: start, $lte: end };
    }

    const data = await ScheduleService.findSchedulesFiltered(tenderId, dateFilter, particularDate);
    res.json({
      status: true,
      message: "Schedules fetched successfully",
      data,
    });
  } catch (err) {
    next(err);
  }
};