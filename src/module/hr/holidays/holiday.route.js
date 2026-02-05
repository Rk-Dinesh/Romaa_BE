import { Router } from "express";
import { addHoliday, getHolidays, bulkInsertHolidaysController, getHolidaysList } from "./holiday.controller.js";
import multer from "multer";

const upload = multer({ dest: "uploads/" });

const CalendarRoute = Router();

CalendarRoute.post("/add", addHoliday); // Protect with Admin Middleware
CalendarRoute.get("/list", getHolidays);
CalendarRoute.get("/listall", getHolidaysList);
CalendarRoute.post("/uploadcsv", upload.single("file"), bulkInsertHolidaysController);

export default CalendarRoute;