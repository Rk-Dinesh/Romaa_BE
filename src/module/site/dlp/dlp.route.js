import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  bulkCreateReports,
  createReport,
  getReportsByProject,
  getReportsByContractor,
  getReportById,
  getSummaryByDate,
  getReportsByDate,
  updateReport,
  updateStatus,
  deleteReport,
} from "./dlp.controller.js";

const dlpRouter = Router();
dlpRouter.use(verifyJWT);

// POST   /dlp/api/create
dlpRouter.post("/api/create", createReport);

// POST   /dlp/api/bulk-create   body: [...reports] or { reports: [...] }
dlpRouter.post("/api/bulk-create", bulkCreateReports);

// GET    /dlp/api/list/:project_id                    ?from=&to=
dlpRouter.get("/api/list/:project_id", getReportsByProject);

// GET    /dlp/api/list/:project_id/:contractor_id     ?from=&to=
dlpRouter.get("/api/list/:project_id/:contractor_id", getReportsByContractor);

// GET    /dlp/api/summary/:project_id
dlpRouter.get("/api/summary/:project_id", getSummaryByDate);

// GET    /dlp/api/report-date/:project_id/:report_date
dlpRouter.get("/api/report-date/:project_id/:report_date", getReportsByDate);

// GET    /dlp/api/details/:id
dlpRouter.get("/api/details/:id", getReportById);

// PUT    /dlp/api/update/:id
dlpRouter.put("/api/update/:id", updateReport);

// PATCH  /dlp/api/status/:id   body: { status: "APPROVED"|"REJECTED", remark? }
dlpRouter.patch("/api/status/:id", updateStatus);

// DELETE /dlp/api/delete/:id
dlpRouter.delete("/api/delete/:id", deleteReport);

export default dlpRouter;
