import { Router } from "express";
import multer from "multer";
import { getSchedule, getAllSchedule, uploadScheduleCSV, uploadScheduleDatesCSV, updateRowSchedule } from "./schedulelite.controller.js";

const scheduleLiteRouter = Router();
const upload = multer({ dest: "uploads/" });

scheduleLiteRouter.post("/upload-csv", upload.single("file"), uploadScheduleCSV);
scheduleLiteRouter.post("/upload-csv-dates", upload.single("file"), uploadScheduleDatesCSV);
scheduleLiteRouter.get("/get-schedule/:tender_id", getSchedule);
scheduleLiteRouter.get("/get-all-schedule/:tender_id", getAllSchedule);
scheduleLiteRouter.post("/update-schedule/:tender_id", updateRowSchedule);

export default scheduleLiteRouter;