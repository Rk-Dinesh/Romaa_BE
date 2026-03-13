import { Router } from "express";
import {
  createReport,
  getReportsByTender,
  getReportById,
  getReportsByDate,
  updateReport,
  updateStatus,
  deleteReport,
} from "./workdone.controller.js";

const workdoneRouter = Router();

// POST   /workdone/api/create
workdoneRouter.post("/api/create", createReport);

// GET    /workdone/api/list/:tender_id          ?from=&to=
workdoneRouter.get("/api/list/:tender_id", getReportsByTender);

// GET    /workdone/api/report-date/:tender_id/:report_date
workdoneRouter.get("/api/report-date/:tender_id/:report_date", getReportsByDate);

// GET    /workdone/api/details/:id
workdoneRouter.get("/api/details/:id", getReportById);

// PUT    /workdone/api/update/:id
workdoneRouter.put("/api/update/:id", updateReport);

// PATCH  /workdone/api/status/:id   body: { status: "Draft"|"Submitted"|"Approved"|"Rejected" }
workdoneRouter.patch("/api/status/:id", updateStatus);

// DELETE /workdone/api/delete/:id
workdoneRouter.delete("/api/delete/:id", deleteReport);

export default workdoneRouter;
