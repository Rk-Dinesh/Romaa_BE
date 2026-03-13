import { Router } from "express";
import {
  createWorkDone,
  bulkCreateWorkDone,
  getAllWorkDoneByTender,
  getWorkDoneSpecific,
  getWorkDoneReportDate,
  getWorkDoneSummaryByDate
} from "./workorderdone.controller.js";

const workDoneRouter = Router();

workDoneRouter.post('/api/create', createWorkDone);
workDoneRouter.post('/api/bulk-create', bulkCreateWorkDone);
workDoneRouter.get('/api/list/:tender_id', getAllWorkDoneByTender);
workDoneRouter.get('/api/summary/:tender_id', getWorkDoneSummaryByDate);
workDoneRouter.get('/api/details/:tender_id/:workDoneId', getWorkDoneSpecific);
workDoneRouter.get('/api/report-date/:tender_id/:report_date', getWorkDoneReportDate);

export default workDoneRouter;