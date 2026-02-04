import { Router } from "express";
import { addHoliday, getHolidays } from "./holiday.controller.js";

const CalendarRoute = Router();

CalendarRoute.post("/add", addHoliday); // Protect with Admin Middleware
CalendarRoute.get("/list", getHolidays);

export default CalendarRoute;