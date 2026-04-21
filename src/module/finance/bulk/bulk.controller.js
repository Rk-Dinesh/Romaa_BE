import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parseFileToJson } from "../../../../utils/parseFileToJson.js";
import BulkImportService from "./bulk.import.service.js";
import BulkExportService, { streamModuleExport, EXPORT_COLUMNS } from "./bulk.export.service.js";
import { TEMPLATES } from "./bulk.templates.js";
import BulkJobModel from "./bulkjob.model.js";
import logger from "../../../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Resolve the upload directory and ensure it exists at startup
const uploadDir = path.join(__dirname, "../../../../uploads/bulk");
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIMETYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream", // some OS sends this for .csv
]);

// Multer: disk storage with MIME check, extension whitelist, and 10 MB size cap
export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `bulk_${Date.now()}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".csv", ".xlsx", ".xls"].includes(ext)) {
      return cb(new Error("Only CSV (.csv) and Excel (.xlsx, .xls) files are allowed"), false);
    }
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported MIME type: ${file.mimetype}`), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const MODULE_IMPORTERS = {
  purchasebill:   BulkImportService.importPurchaseBills.bind(BulkImportService),
  paymentvoucher: BulkImportService.importPaymentVouchers.bind(BulkImportService),
  receiptvoucher: BulkImportService.importReceiptVouchers.bind(BulkImportService),
  journalentry:   BulkImportService.importJournalEntries.bind(BulkImportService),
  expensevoucher: BulkImportService.importExpenseVouchers.bind(BulkImportService),
  creditnote:     BulkImportService.importCreditNotes.bind(BulkImportService),
  debitnote:      BulkImportService.importDebitNotes.bind(BulkImportService),
};

// POST /finance/bulk/:module/import
// Creates a BulkJob immediately (202) and processes the file in the background.
// Poll GET /finance/bulk/jobs/:jobId for progress.
export const bulkImport = async (req, res) => {
  const { module } = req.params;
  const importer   = MODULE_IMPORTERS[module];

  if (!importer) {
    return res.status(400).json({
      status: false,
      message: `Unknown module: '${module}'. Valid modules: ${Object.keys(MODULE_IMPORTERS).join(", ")}`,
    });
  }

  if (!req.file) {
    return res.status(400).json({ status: false, message: "No file uploaded. Please attach a CSV or Excel file." });
  }

  // Create job record and respond immediately with 202 Accepted
  const job = await BulkJobModel.create({
    module,
    filename:     req.file.originalname,
    initiated_by: req.user?._id,
  });

  res.status(202).json({
    status:  true,
    message: "Import started. Poll /finance/bulk/jobs/:jobId for progress.",
    job_id:  job._id,
  });

  // Run the actual import asynchronously — response already sent above
  const filePath = req.file.path;
  setImmediate(async () => {
    try {
      const rows = await parseFileToJson(filePath, req.file.originalname);

      if (!rows || rows.length === 0) {
        await BulkJobModel.findByIdAndUpdate(job._id, {
          status: "failed",
          errors: [{ row: 0, message: "File is empty or contains no data rows." }],
          completed_at: new Date(),
        });
        return;
      }

      await BulkJobModel.findByIdAndUpdate(job._id, { total: rows.length });

      const importedBy = req.user?._id;
      const result     = await importer(rows, importedBy);

      await BulkJobModel.findByIdAndUpdate(job._id, {
        status:       "completed",
        success:      result.success,
        failed:       result.failed,
        errors:       (result.errors || []).slice(0, 100), // cap stored errors at 100
        completed_at: new Date(),
      });
    } catch (err) {
      logger.error({
        correlationId: req.correlationId,
        context:       "bulkImport.background",
        module,
        jobId:         job._id,
        message:       err.message,
      });
      await BulkJobModel.findByIdAndUpdate(job._id, {
        status:       "failed",
        errors:       [{ row: 0, message: err.message }],
        completed_at: new Date(),
      });
    } finally {
      fs.unlink(filePath, () => {});
    }
  });
};

// GET /finance/bulk/jobs/:jobId — poll import job progress
export const getJobStatus = async (req, res) => {
  try {
    const job = await BulkJobModel.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ status: false, message: "Job not found" });
    res.status(200).json({ status: true, data: job });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// GET /finance/bulk/:module/template
// Returns a CSV file with commented notes, column headers, and a sample row.
export const downloadTemplate = (req, res) => {
  const { module } = req.params;
  const tpl        = TEMPLATES[module];

  if (!tpl) {
    return res.status(400).json({
      status: false,
      message: `No template for module: '${module}'. Valid modules: ${Object.keys(TEMPLATES).join(", ")}`,
    });
  }

  const notesBlock = tpl.notes.map((n) => `# ${n}`).join("\n");
  const headerRow  = tpl.headers.join(",");
  const sampleRow  = tpl.headers
    .map((h) => {
      const v = tpl.sampleRow[h] ?? "";
      const s = String(v);
      // Quote values that contain commas or double-quotes
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");

  const csv = `${notesBlock}\n${headerRow}\n${sampleRow}\n`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="template_${module}.csv"`);
  return res.send(csv);
};

// ── Module → exporter map ─────────────────────────────────────────────────────
const MODULE_EXPORTERS = {
  purchasebill:   BulkExportService.exportPurchaseBills.bind(BulkExportService),
  paymentvoucher: BulkExportService.exportPaymentVouchers.bind(BulkExportService),
  receiptvoucher: BulkExportService.exportReceiptVouchers.bind(BulkExportService),
  journalentry:   BulkExportService.exportJournalEntries.bind(BulkExportService),
  expensevoucher: BulkExportService.exportExpenseVouchers.bind(BulkExportService),
  creditnote:     BulkExportService.exportCreditNotes.bind(BulkExportService),
  debitnote:      BulkExportService.exportDebitNotes.bind(BulkExportService),
  // Reports
  trial_balance:  BulkExportService.exportTrialBalance.bind(BulkExportService),
  profit_loss:    BulkExportService.exportProfitLoss.bind(BulkExportService),
  ledger:         BulkExportService.exportLedger.bind(BulkExportService),
  aged_payables:  BulkExportService.exportAgedPayables.bind(BulkExportService),
};

// GET /finance/bulk/:module/export
// Query params: from_date, to_date, fin_year, status, vendor_id, client_id,
//               tender_id, account_code (for ledger export), format=csv|excel
export const bulkExport = async (req, res) => {
  const { module } = req.params;
  const format     = req.query.format || "excel"; // "excel" | "csv"

  const filters = {
    from_date:    req.query.from_date    || undefined,
    to_date:      req.query.to_date      || undefined,
    fin_year:     req.query.fin_year     || undefined,
    status:       req.query.status       || undefined,
    vendor_id:    req.query.vendor_id    || undefined,
    client_id:    req.query.client_id    || undefined,
    tender_id:    req.query.tender_id    || undefined,
    account_code: req.query.account_code || undefined,
  };

  // Strip undefined keys so service filter logic (truthy checks) works correctly
  for (const key of Object.keys(filters)) {
    if (filters[key] === undefined) delete filters[key];
  }

  // ── Streaming CSV — memory-efficient path for large datasets ──────────────
  if (format === "csv") {
    if (!EXPORT_COLUMNS[module]) {
      return res.status(400).json({
        status:  false,
        message: `CSV export not supported for module: '${module}'. Supported: ${Object.keys(EXPORT_COLUMNS).join(", ")}`,
      });
    }
    const filename = `${module}_export_${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("x-correlation-id", req.correlationId || "");
    try {
      for await (const chunk of streamModuleExport(module, filters)) {
        res.write(chunk);
      }
      res.end();
    } catch (err) {
      logger.error({
        correlationId: req.correlationId,
        context:       "bulkExport.csv",
        message:       err.message,
        module,
      });
      if (!res.headersSent) {
        res.status(500).json({ status: false, message: err.message });
      }
    }
    return;
  }

  // ── Default: Excel buffer export (existing logic — unchanged) ─────────────
  const exporter = MODULE_EXPORTERS[module];

  if (!exporter) {
    return res.status(400).json({
      status:  false,
      message: `Unknown module: '${module}'. Valid modules: ${Object.keys(MODULE_EXPORTERS).join(", ")}`,
    });
  }

  try {
    const buffer   = await exporter(filters);
    const filename = `${module}_export_${Date.now()}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("x-correlation-id", req.correlationId || "");
    return res.send(buffer);
  } catch (err) {
    logger.error({
      correlationId: req.correlationId,
      context:       "bulkExport",
      message:       err.message,
      module,
    });
    return res.status(500).json({ status: false, message: err.message });
  }
};
