import { Router } from "express";
import { addHoliday, getHolidays, bulkInsertHolidaysController, getHolidaysList, deleteHoliday, updateHoliday } from "./holiday.controller.js";
import multer from "multer";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

// CSV bulk-upload writes to disk (parseFileToJson reads the file path)
const diskUpload = multer({ dest: "uploads/" });

const CalendarRoute = Router();

// Public reads
CalendarRoute.get("/list",    getHolidays);
CalendarRoute.get("/listall", getHolidaysList);

// HR admin writes
CalendarRoute.post("/add",          verifyJWT, verifyPermission("hr", "holidays", "create"), addHoliday);
CalendarRoute.put("/update/:id",    verifyJWT, verifyPermission("hr", "holidays", "edit"),   updateHoliday);
CalendarRoute.delete("/delete/:id", verifyJWT, verifyPermission("hr", "holidays", "delete"), deleteHoliday);
CalendarRoute.post("/uploadcsv",    verifyJWT, verifyPermission("hr", "holidays", "create"), diskUpload.single("file"), bulkInsertHolidaysController);

export default CalendarRoute;
