import { Router } from "express";
import multer from "multer";
import { 
    getDailySchedule, 
    getSchedule, 
    updateScheduleData, 
    uploadScheduleCSV, 
    uploadScheduleDatesCSV 
} from "./schedule.controller.js";

const schedulerouter = Router();
const upload = multer({ dest: "uploads/" });

schedulerouter.post("/upload-csv", upload.single("file"), uploadScheduleCSV);
schedulerouter.post("/upload-csv-dates", upload.single("file"), uploadScheduleDatesCSV);

schedulerouter.get("/get-schedule/:tender_id", getSchedule);
schedulerouter.get("/get-daily-schedule/:tender_id", getDailySchedule);

schedulerouter.put("/update-daily-schedule/:tender_id", updateScheduleData);

export default schedulerouter;