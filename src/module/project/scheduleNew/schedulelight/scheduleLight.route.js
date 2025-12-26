import { Router } from "express";
import multer from "multer";
import { getSchedule, uploadScheduleCSV } from "./scheduleLight.controller.js";

const scheduleLightRouter = Router();
const upload = multer({ dest: "uploads/" });

scheduleLightRouter.post("/upload-csv", upload.single("file"), uploadScheduleCSV);
scheduleLightRouter.get("/get-schedule/:tender_id", getSchedule);

export default scheduleLightRouter;