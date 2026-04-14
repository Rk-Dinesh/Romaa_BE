import BoqService from "./boq.service.js";
import csvParser from "csv-parser";
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createBoq = async (req, res) => {
  try {
    const result = await BoqService.addBoq(req.body);
    res.status(201).json({ status: true, message: "Bill of Quantities created successfully.", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const addOrUpdateBoqItem = async (req, res) => {
  try {
    const result = await BoqService.addOrUpdateBoqItem(req.body);
    res.status(200).json({
      status: true,
      message: "Bill of Quantities item(s) added/updated successfully.",
      data: result,
    });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({
      status: false,
      message: error.message,
    });
  }
};

export const getAllBoqs = async (req, res) => {
  try {
    const result = await BoqService.getAllBoqs();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getBoqById = async (req, res) => {
  try {
    const result = await BoqService.getBoqById(req.params.boq_id);
    if (!result) return res.status(404).json({ status: false, message: "Bill of Quantities record not found for the specified BOQ ID." });
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateBoq = async (req, res) => {
  try {
    const result = await BoqService.updateBoq(req.params.boq_id, req.body);
    if (!result) return res.status(404).json({ status: false, message: "Bill of Quantities record not found. Update could not be completed." });
    res.status(200).json({ status: true, message: "Bill of Quantities updated successfully.", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const addItemToBoq = async (req, res) => {
  try {
    const result = await BoqService.addItemToBoq(req.params.boq_id, req.body);
    res.status(200).json({ status: true, message: "Bill of Quantities item added successfully.", data: result });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};

export const removeItemFromBoq = async (req, res) => {
  try {
    const result = await BoqService.removeItemFromBoq(req.params.tender_id, req.params.item_code);
    res.status(200).json({ status: true, message: "Bill of Quantities item removed successfully.", data: result });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};

export const deleteBoq = async (req, res) => {
  try {
    const result = await BoqService.deleteBoq(req.params.boq_id);
    res.status(200).json({ status: true, message: "Bill of Quantities record deleted successfully.", data: result });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};


export const getBoqItemsPaginated = async (req, res) => {
  try {
    const tender_id = req.params.tender_id;  // from URL
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const data = await BoqService.getBoqItemsPaginated(
      tender_id,
      page,
      limit,
      search
    );

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalCount: data.total,
      data: data.items
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getBoqByTenderId = async (req, res) => {
  try {
    const boq = await BoqService.findBoqByTenderId(req.params.tender_id);
   if (!boq) {
      return res.status(200).json({
        status: true,
        data: {} 
      });
    }
    res.status(200).json({ status: true, data: boq });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const uploadBoqCSV = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: false, message: "No file uploaded. Please attach a valid CSV file." });



    const { created_by_user, tender_id, phase, revision, prepared_by, approved_by } = req.body;

    if (!created_by_user) return res.status(400).json({ status: false, message: "Created by user is required." });
    if (!tender_id) return res.status(400).json({ status: false, message: "Tender ID is required." });
        const parsedRevision = revision ? Number(revision.toString().trim()) : 0;
if (isNaN(parsedRevision)) {
  return res.status(400).json({ status: false, message: "Revision must be a valid number." });
}


    const csvRows = [];
    const filePath = path.join(__dirname, "../../../../uploads", req.file.filename);

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => {
        csvRows.push(row);
      })
      .on("end", async () => {
        try {
          const result = await BoqService.bulkInsert(csvRows, created_by_user, tender_id, phase, prepared_by, approved_by);
          res.status(200).json({ status: true, message: "Bill of Quantities data uploaded successfully.", data: result });
        } catch (error) {
          next(error);
        } finally {
          fs.unlinkSync(filePath); // Delete file after processing
        }
      });
  } catch (error) {
    next(error);
  }

};


export const getBoqItems = async (req, res) => {
  try {
    const boq = await BoqService.getBoqItems(req.params.tender_id);
    res.status(200).json({ status: true, data: boq });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getDrawingQuantity = async (req, res) => {
  try {
    const boq = await BoqService.getDrawingQuantity(req.params.tender_id);
    res.status(200).json({ status: true, data: boq });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const bulkUpdateDrawingQuantity = async (req, res) => {
    try {
       const tender_id = req.params.tender_id;
        const {  items } = req.body; 

        // Validate before calling service
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ 
                status: false, 
                message: "Invalid items format. Expected an array." 
            });
        }

        await BoqService.bulkUpdateDrawingQuantity(tender_id, items);
        
        return res.status(200).json({ status: true, message: "Updated successfully" });
    } catch (error) {
        const code = error.message.includes("not found") ? 404 : 400;
        return res.status(code).json({ status: false, message: error.message });
    }
};