import { Router } from "express";
import multer from "multer";
import { getSchedule, getAllSchedule, uploadScheduleCSV, uploadScheduleDatesCSV, updateRowSchedule, updateDailyQuantity, updateDailyQuantityBulk, getDailySchedule } from "./schedulelite.controller.js";

const scheduleLiteRouter = Router();
const upload = multer({ dest: "uploads/" });

scheduleLiteRouter.post("/upload-csv", upload.single("file"), uploadScheduleCSV);
scheduleLiteRouter.post("/upload-csv-dates", upload.single("file"), uploadScheduleDatesCSV);
scheduleLiteRouter.get("/get-schedule/:tender_id", getSchedule);
scheduleLiteRouter.get("/get-all-schedule/:tender_id", getAllSchedule);
scheduleLiteRouter.get("/get-daily-schedule/:tender_id", getDailySchedule);
scheduleLiteRouter.post("/update-schedule/:tender_id", updateRowSchedule);
scheduleLiteRouter.post("/update-daily-quantity/:tender_id", updateDailyQuantity);
scheduleLiteRouter.post("/update-daily-quantity-bulk/:tender_id", updateDailyQuantityBulk);

export default scheduleLiteRouter;


//bulk daily
// {
//   "tender_id": "TND020",
//   "updates": [
//     {
//       "row_index": 7,
//       "date": "2026-01-06",
//       "quantity": 5
//     },
//     {
//       "row_index": 7,
//       "date": "2026-01-07",
//       "quantity": 2.2
//     },
//     {
//       "row_index": 7,
//       "date": "2026-01-08",
//       "quantity": 0
//     },
//     {
//       "row_index": 10,
//       "date": "2026-02-01",
//       "quantity": 150
//     },
//     {
//       "row_index": 12,
//       "date": "2026-02-15",
//       "quantity": 10
//     }
//   ]
// }


//update schedule

//   {
//   "row_index": 7,
//   "revised_duration": 5,
//   "predecessor":"3FS+4"

// }