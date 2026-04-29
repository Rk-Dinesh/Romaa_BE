import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  createWorkDone,
  bulkCreateWorkDone,
  getAllWorkDoneByTender,
  getWorkDoneSpecific,
  getWorkDoneReportDate,
  getWorkDoneSummaryByDate
} from "./workorderdone.controller.js";

const workOrderDoneRouter = Router();
workOrderDoneRouter.use(verifyJWT);

workOrderDoneRouter.post('/api/create', createWorkDone);
workOrderDoneRouter.post('/api/bulk-create', bulkCreateWorkDone);
workOrderDoneRouter.get('/api/list/:tender_id', getAllWorkDoneByTender);
workOrderDoneRouter.get('/api/summary/:tender_id', getWorkDoneSummaryByDate);
workOrderDoneRouter.get('/api/details/:tender_id/:workDoneId', getWorkDoneSpecific);
workOrderDoneRouter.get('/api/report-date/:tender_id/:report_date', getWorkDoneReportDate);

export default workOrderDoneRouter;