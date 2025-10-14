import { Router } from "express";
import multer from "multer";
import { getSchedules, uploadScheduleCSV } from "./schedule.controller.js";


const schedulerouter = Router();
const upload = multer({ dest: "uploads/" });

schedulerouter.post("/uploadcsv", upload.single("file"),uploadScheduleCSV); 
schedulerouter.get("/getschedule", getSchedules);

export default schedulerouter;