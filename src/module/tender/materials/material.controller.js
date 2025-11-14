import materialService from "./material.service.js";
import csvParser from "csv-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createMaterial = async (req, res) => {
  try {
    const data = req.body;
    const material = await materialService.createMaterial(data);
    res.status(201).json({ success: true, data: material });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addMaterialreceived = async (req, res) => {
  try {
    const material = await materialService.addMaterialreceived(req.body);
    res
      .status(200)
      .json({ message: "Material received successfully", material });
  } catch (error) {
    console.error("Error adding material:", error);
    res
      .status(500)
      .json({ message: "Error adding material", error: error.message });
  }
};
export const addMaterialissued = async (req, res) => {
  try {
    const material = await materialService.addMaterialissued(req.body);
    res.status(200).json({ message: "Material issued successfully", material });
  } catch (error) {
    console.error("Error adding material:", error);
    res
      .status(500)
      .json({ message: "Error adding material", error: error.message });
  }
};

export const uploadMaterialCSV = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { created_by_user, tender_id } = req.body;

    if (!created_by_user)
      return res.status(400).json({ error: "created_by_user is required" });

    if (!tender_id)
      return res.status(400).json({ error: "tender_id is required" });

    const csvRows = [];
    const filePath = path.join(
      __dirname,
      "../../../../uploads",
      req.file.filename
    );

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => csvRows.push(row))
      .on("end", async () => {
        try {
          const result = await materialService.bulkInsert(
            csvRows,
            created_by_user,
            tender_id
          );
          res.status(200).json({
            status: true,
            message: "Material CSV uploaded successfully",
            data: result,
          });
        } catch (error) {
          next(error);
        } finally {
          fs.unlinkSync(filePath);
        }
      });
  } catch (error) {
    next(error);
  }
};

// ✅ For frontend pagination request
export const getMaterialsByTender = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await materialService.getAllMaterials(
      tender_id,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: result.items,
      totalPages: result.totalPages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};