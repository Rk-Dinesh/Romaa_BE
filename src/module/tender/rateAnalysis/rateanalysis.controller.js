import WorkItemService from './rateanalysis.service.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { parseFileToJson } from '../../../../utils/parseFileToJson.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const addWorkItem = async (req, res) => {
  try {
    const result = await WorkItemService.addWorkItem(req.body);
    res.status(201).json({ status: true, message: 'Rate Analysis work item created successfully.', data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getAllWorkItems = async (req, res) => {
  try {
    const items = await WorkItemService.getAllWorkItems();
    res.status(200).json({ status: true, data: items });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getWorkItemById = async (req, res) => {
  try {
    const item = await WorkItemService.getWorkItemById(req.params.id);
    if (!item) return res.status(404).json({ status: false, message: 'Rate analysis record not found. Please verify the ID and try again.' });
    res.status(200).json({ status: true, data: item });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getWorkItemsByTenderId = async (req, res) => {
  try {
    const { tenderId } = req.query;
    if (!tenderId) return res.status(400).json({ status: false, message: 'Tender ID is required to retrieve rate analysis data.' });
    const item = await WorkItemService.getWorkItemsByTenderId(tenderId);
    if (!item) return res.status(404).json({ status: false, message: 'Rate analysis record not found for this tender. Please verify the Tender ID and try again.' });
    res.status(200).json({ status: true, data: item });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
}

export const updateWorkItem = async (req, res) => {
  try {
    const updated = await WorkItemService.updateWorkItem(req.params.id, req.body);
    if (!updated) return res.status(404).json({ status: false, message: 'Rate analysis record not found. Please verify the ID and try again.' });
    res.status(200).json({ status: true, message: 'Rate analysis work item updated successfully.', data: updated });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteWorkItem = async (req, res) => {
  try {
    const deleted = await WorkItemService.deleteWorkItem(req.params.id);
    if (!deleted) return res.status(404).json({ status: false, message: 'Rate analysis record not found. Please verify the ID and try again.' });
    res.status(200).json({ status: true, message: 'Rate analysis work item deleted successfully.', data: deleted });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};




export const uploadWorkItemsCSVAndSyncBoq = async (req, res) => {
  let filePath = null;
  try {
    const { tender_id } = req.body;
    if (!tender_id) {
      return res.status(400).json({ status: false, message: "Tender ID is required to upload Rate Analysis data." });
    }
    if (!req.file) {
      return res.status(400).json({ status: false, message: "No file uploaded. Please attach a valid CSV or Excel file." });
    }

    filePath = path.join(__dirname, "../../../../uploads", req.file.filename);
    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, message: "The uploaded file is empty. Please provide a file with valid Rate Analysis data." });
    }

    const created_by_user = req.user?.name || req.user?._id?.toString() || "SYSTEM";
    const workItemsDoc = await WorkItemService.bulkInsertWorkItemsFromCsv(dataRows, tender_id, created_by_user);
    res.status(200).json({ status: true, message: "Rate Analysis data uploaded and synced successfully.", data: workItemsDoc });
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: false, message: error.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupErr) {
        console.error("Error deleting uploaded file:", cleanupErr);
      }
    }
  }
};

export const updateRateAnalysis = async (req, res) => {
  const { tender_id } = req.params;
  const { work_items } = req.body;

  try {
    if (!tender_id) return res.status(400).json({ status: false, message: "Tender ID is required to update rate analysis data." });
    const created_by_user = req.user?.name || req.user?._id?.toString() || "SYSTEM";
    const updatedDoc = await WorkItemService.updateRateAnalysis(work_items, tender_id, created_by_user);
    res.status(200).json({ status: true, message: "Rate analysis updated successfully.", data: updatedDoc });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const freezeRateAnalysis = async (req, res) => {
  const { tender_id } = req.params;

  try {
    const updatedDoc = await WorkItemService.freezeRateAnalysis(tender_id);
    res.status(200).json({ status: true, message: "Rate Analysis frozen successfully.", data: updatedDoc });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getSummary = async (req, res) => {
  const { tender_id } = req.params;

  try {
    const summary = await WorkItemService.getSummary(tender_id);
    res.status(200).json({ status: true, message: "Summary retrieved successfully.", data: summary });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

