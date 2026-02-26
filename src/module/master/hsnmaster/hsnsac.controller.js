import HsnSacService from "./hsnsac.service.js";
import fs from "fs";
import path from "path";
import { parseFileToJson } from "../../../../utils/parseFileToJson.js";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const createHsnSac = async (req, res) => {
  try {
    // Optional: inject req.user._id if tracking who created it
    // req.body.createdBy = req.user._id; 
    const result = await HsnSacService.createHsnSac(req.body);
    res.status(201).json({ success: true, message: "Record created successfully", data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const bulkUploadHsnSac = async (req, res, next) => {
  let filePath = null;

  try {
    // 1. Validate File Existence
    if (!req.file) {
      return res.status(400).json({ status: false, error: "No file uploaded" });
    }

    // 2. Resolve File Path
    // Adjust the path resolution based on where your multer saves files
    filePath = path.join(__dirname, "../../../../uploads", req.file.filename);

    // 3. Parse CSV to JSON Array
    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (!dataRows || dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty or could not be parsed" });
    }

    // 4. Pass to Service
    const result = await HsnSacService.bulkUploadHsnSacFromCsv(dataRows);

    // 5. Send Response
    res.status(200).json({
      status: true,
      message: "HSN/SAC CSV data processed successfully",
      data: result,
    });

  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
  } finally {
    // 6. Cleanup: Delete file after processing to save disk space
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupErr) {
        console.error("Error deleting uploaded HSN CSV file:", cleanupErr);
      }
    }
  }
};

export const getAllHsnSac = async (req, res) => {
  try {
    const result = await HsnSacService.getAllHsnSac(req.query);
    res.status(200).json({ success: true, data: result.data, meta: result.meta });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getHsnSacById = async (req, res) => {
  try {
    const result = await HsnSacService.getHsnSacById(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

export const updateHsnSac = async (req, res) => {
  try {
    // Optional: req.body.updatedBy = req.user._id;
    const result = await HsnSacService.updateHsnSac(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Record updated successfully", data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteHsnSac = async (req, res) => {
  try {
    await HsnSacService.deleteHsnSac(req.params.id);
    res.status(200).json({ success: true, message: "Record deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const toggleHsnSacStatus = async (req, res) => {
  try {
    const result = await HsnSacService.toggleStatus(req.params.id);
    const statusText = result.isActive ? "Activated" : "Deactivated";
    res.status(200).json({ success: true, message: `Record ${statusText} successfully`, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};