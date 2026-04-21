import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { bulkImport, downloadTemplate, upload, bulkExport, getJobStatus } from "./bulk.controller.js";

const bulkRouter = Router();

// GET /finance/bulk/jobs/:jobId — poll import job status (must come before /:module routes)
bulkRouter.get(
  "/jobs/:jobId",
  verifyJWT,
  getJobStatus
);

// GET /finance/bulk/:module/template — download blank CSV template (read-only, no write permission needed)
bulkRouter.get(
  "/:module/template",
  verifyJWT,
  downloadTemplate
);

// POST /finance/bulk/:module/import — upload and process CSV/Excel file
bulkRouter.post(
  "/:module/import",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "create"),
  upload.single("file"),
  bulkImport
);

// GET /finance/bulk/:module/export — export DB records to Excel download
bulkRouter.get(
  "/:module/export",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  bulkExport
);

export default bulkRouter;
