import ScheduleService from "./shedule.service.js";
import csvParser from "csv-parser";
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
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
