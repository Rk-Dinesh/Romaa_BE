import { Router } from "express";
import multer from "multer";
import {
  getMajorHeadingNames,
  getMajorHeadings,
  getSchedules,
  getSubheadingCustomworks,
  getSubheadings,
  getSubworks,
  getSubworksByCustomworks,
  updateScheduleReportDate,
  uploadScheduleCSV,
} from "./schedule.controller.js";

const schedulerouter = Router();
const upload = multer({ dest: "uploads/" });

schedulerouter.post("/uploadcsv", upload.single("file"), uploadScheduleCSV);
// use formData to send the following body & also the file (sample file in utils schedule.csv)
// [
//   {
//     key: "workOrderDate",
//     value: "2025-10-07",
//   },
//   {
//     key: "aggDate",
//     value: "2025-10-07",
//   },
//   {
//     key: "agreementValue",
//     value: "230242327",
//   },
//   {
//     key: "projectEndDate",
//     value: "2026-07-10",
//   },
//   {
//     key: "plannedCompletionDate",
//     value: "2026-05-15",
//   },
//   {
//     key: "reportDate",
//     value: "2025-09-25",
//   },
//   {
//     key: "projectName",
//     value: "Checkdam",
//   },
//   {
//     key: "tenderId",
//     value: "TENDER001",
//   },
//   { key: "notes", value: "w"},
// ];

schedulerouter.get("/getschedule", getSchedules);
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

schedulerouter.put("/updatereportdate", updateScheduleReportDate);
// req.body
// {
//   "tenderId": "TENDER001",
//   "reportDate": "2025-10-28"
// }

schedulerouter.get("/api/:tenderId/majorheadings", getMajorHeadings);
schedulerouter.get(
  "/api/:tenderId/majorheading/:majorHeadingName/subheadings",
  getSubheadings
);
schedulerouter.get(
  "/api/:tenderId/majorheading/:majorHeadingName/subheading/:customworks/subworks",
  getSubworks)
//localhost:5000/schedule/apischedule/TND021/majorheadings
schedulerouter.get("/apischedule/:tenderId/majorheadings", getMajorHeadingNames); // check done
//localhost:5000/schedule/apischedule/TND021/majorheading/B - LHS Side - High Portion - Shed Side/subheadings
schedulerouter.get(
  "/apischedule/:tenderId/majorheadings/:majorHeadingName/subheadings",
  getSubheadingCustomworks
);
//
schedulerouter.get("/apischedule/:tenderId/majorheadings/:majorHeadingName/subheadings/:customworks/subworks",
  getSubworksByCustomworks
);
export default schedulerouter;
