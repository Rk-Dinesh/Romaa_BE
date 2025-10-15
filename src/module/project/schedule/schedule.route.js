import { Router } from "express";
import multer from "multer";
import { getSchedules, updateScheduleReportDate, uploadScheduleCSV } from "./schedule.controller.js";


const schedulerouter = Router();
const upload = multer({ dest: "uploads/" });

schedulerouter.post("/uploadcsv", upload.single("file"),uploadScheduleCSV); 
schedulerouter.get("/getschedule", getSchedules);
schedulerouter.put("/updatereportdate", updateScheduleReportDate);


export default schedulerouter;


// Specific week and month in a year:
// /schedule/getschedule?tenderId=XXX&week=firstWeek&month=jan&year=2025

// Specific month in a year:
// /schedule/getschedule?tenderId=XXX&month=feb&year=2026

// Full year:
// /schedule/getschedule?tenderId=XXX&year=2027

// Particular date:
// /schedule/getschedule?tenderId=XXX&particularDate=2025-10-07

// Custom date range:
// /schedule/getschedule?tenderId=XXX&startDate=2025-10-01&endDate=2025-10-21