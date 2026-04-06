import { parseFileToJson } from "../../../../../utils/parseFileToJson.js";
import BillingService from "./clientbilling.service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadBillingCSV = async (req, res, next) => {

  let filePath = null;
  try {
    if (!req.file) return res.status(400).json({ status: false, message: "No file uploaded" });

    const {
      tender_id,
      bill_id,
      bill_date,
      tax_mode,
      cgst_pct,
      sgst_pct,
      igst_pct,
      retention_pct,
      deductions: deductionsRaw,
      created_by_user,
    } = req.body;

    if (!tender_id) return res.status(400).json({ status: false, message: "tender_id is required" });

    // Parse JSON fields that arrive as strings from multipart form-data
    let deductions = [];
    if (deductionsRaw) {
      try {
        deductions = JSON.parse(deductionsRaw);
      } catch {
        return res.status(400).json({ status: false, message: "deductions must be valid JSON" });
      }
    }

    const meta = {
      bill_id,
      bill_date:       bill_date || undefined,
      tax_mode:        tax_mode  || "instate",
      cgst_pct:        Number(cgst_pct)       || 0,
      sgst_pct:        Number(sgst_pct)       || 0,
      igst_pct:        Number(igst_pct)       || 0,
      retention_pct:   Number(retention_pct)  || 0,
      deductions,
      created_by_user: created_by_user || "",
    };

    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);

    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, message: "Uploaded file contains no data rows" });
    }

    const result = await BillingService.bulkInsert(dataRows, tender_id, meta);
    res.status(201).json({ status: true, message: "Client billing data uploaded successfully", data: result });
  } catch (error) {
    const code = error.message.includes("not found") ? 404
               : error.message.includes("status") || error.message.includes("Zero items") || error.message.includes("headers") ? 400
               : 500;
    res.status(code).json({ status: false, message: error.message });
  } finally {
    // 5. Cleanup: Delete file after processing
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupErr) {
        console.error("Error deleting file:", cleanupErr);
      }
    }
  }
};

// Get History (The Timeline)
export const getHistory = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const history = await BillingService.getBillHistory(tender_id);
    res.status(200).json({ status: true, count: history.length, data: history });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get Single Bill (Detailed View)
export const getDetails = async (req, res) => {
  try {
    const tender_id = req.query.tender_id?.trim();
    const bill_id   = req.query.bill_id?.trim();
    if (!tender_id || !bill_id) return res.status(400).json({ status: false, message: "tender_id and bill_id query params are required" });
    const bill = await BillingService.getBillDetails(tender_id, bill_id);
    if (!bill) return res.status(404).json({ status: false, message: "Client bill record not found. Please verify the tender ID and bill ID" });
    res.status(200).json({ status: true, data: bill });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update existing bill by re-uploading CSV (Draft only)
export const updateBillingCSV = async (req, res) => {
  let filePath = null;
  try {
    const bill_id = req.query.bill_id?.trim();
    if (!bill_id) return res.status(400).json({ status: false, message: "bill_id query param is required" });
    if (!req.file)  return res.status(400).json({ status: false, message: "No file uploaded" });

    const {
      bill_date, tax_mode,
      cgst_pct, sgst_pct, igst_pct,
      retention_pct, deductions: deductionsRaw,
    } = req.body;

    let deductions = [];
    if (deductionsRaw) {
      try { deductions = JSON.parse(deductionsRaw); }
      catch { return res.status(400).json({ status: false, message: "deductions must be valid JSON" }); }
    }

    const meta = {
      bill_date:      bill_date    || undefined,
      tax_mode:       tax_mode     || undefined,
      cgst_pct:       cgst_pct     !== undefined ? Number(cgst_pct)      : undefined,
      sgst_pct:       sgst_pct     !== undefined ? Number(sgst_pct)      : undefined,
      igst_pct:       igst_pct     !== undefined ? Number(igst_pct)      : undefined,
      retention_pct:  retention_pct !== undefined ? Number(retention_pct) : undefined,
      deductions:     deductions.length ? deductions : undefined,
    };

    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);
    const dataRows = await parseFileToJson(filePath, req.file.originalname);
    if (dataRows.length === 0) return res.status(400).json({ status: false, message: "File is empty" });

    const result = await BillingService.updateBillByCSV(dataRows, bill_id, meta);
    res.status(200).json({ status: true, message: "Client bill updated successfully", data: result });
  } catch (error) {
    const code = error.message.includes("not found") ? 404
               : error.message.includes("Draft")     ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.error("Cleanup error:", e); }
    }
  }
};

// Get bill by bill_id — items with current_qty = 0 are excluded
export const getBillById = async (req, res) => {
  try {
    const bill_id = req.query.bill_id?.trim();
    const tender_id = req.query.tender_id?.trim();
    if (!bill_id || !tender_id) return res.status(400).json({ status: false, message: "tender_id and bill_id query params are required" });
    const bill = await BillingService.getBillById(tender_id, bill_id);
    if (!bill) return res.status(404).json({ status: false, message: "Client bill record not found. Please verify the tender ID and bill ID" });
    res.status(200).json({ status: true, data: bill });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Delete Bill — Draft only; also removes linked steel estimate and billing estimate
export const deleteBill = async (req, res) => {
  try {
    const bill_id = req.query.bill_id?.trim();
    if (!bill_id) return res.status(400).json({ status: false, message: "bill_id query param is required" });

    const result = await BillingService.deleteBill(bill_id);

    res.status(200).json({
      status: true,
      message: `Client bill "${result.bill_id}" removed successfully along with ${result.steel_estimates_deleted} steel estimate(s) and ${result.billing_estimates_deleted} billing estimate(s)`,
      data: result,
    });
  } catch (error) {
    const code = error.message.includes("not found") ? 404
               : error.message.includes("status") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// Approve Bill — posts to client receivable ledger
export const approveBill = async (req, res) => {
  try {
    const bill = await BillingService.approveBill(req.params.id);
    res.status(200).json({ status: true, message: "Client bill approved and posted to ledger", data: bill });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("No client") ? 404
               : error.message.includes("already") || error.message.includes("cannot") || error.message.includes("Cannot") ? 400
               : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};