import { Router } from "express";
import multer from "multer";
import { getSchedule, uploadScheduleCSV } from "./schedulelite.controller.js";

const scheduleLiteRouter = Router();
const upload = multer({ dest: "uploads/" });

scheduleLiteRouter.post("/upload-csv", upload.single("file"), uploadScheduleCSV);
scheduleLiteRouter.get("/get-schedule/:tender_id", getSchedule);

export default scheduleLiteRouter;