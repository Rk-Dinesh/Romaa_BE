import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ScheduleLiteService from "./schedulelite.service.js";
import { parseFileToJson } from "../../../../../utils/parseFileToJson.js";


// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export const uploadScheduleCSV = async (req, res, next) => {
  let filePath = null;

  try {
    // 1. Basic Validation
    if (!req.file) {
      return res.status(400).json({ status: false, error: "No file uploaded" });
    }

    const { created_by_user, tender_id } = req.body;

    if (!tender_id) {
      return res.status(400).json({ status: false, error: "tender_id is required" });
    }

    // 2. Prepare File Path
    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);

    // 3. Parse File
    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty" });
    }

    // 4. Call Service
    const result = await ScheduleLiteService.bulkInsert(dataRows, tender_id);

    res.status(200).json({
      status: true,
      message: "Schedule created successfully",
      data: result,
    });

  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
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

export const uploadScheduleDatesCSV = async (req, res, next) => {
  let filePath = null;

  try {
    // 1. Basic Validation
    if (!req.file) {
      return res.status(400).json({ status: false, error: "No file uploaded" });
    }

    const { created_by_user, tender_id } = req.body;

    if (!tender_id) {
      return res.status(400).json({ status: false, error: "tender_id is required" });
    }

    // 2. Prepare File Path
    filePath = path.join(__dirname, "../../../../../uploads", req.file.filename);

    // 3. Parse File
    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty" });
    }

    // 4. Call Service
    const result = await ScheduleLiteService.bulkUpdateScheduleStrict(dataRows, tender_id);

    res.status(200).json({
      status: true,
      message: "Schedule Updated successfully",
      data: result,
    });

  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
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

export const getSchedule = async (req, res) => {
    try {
        const { tender_id } = req.params;

        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.getPopulatedSchedule(tender_id);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};

export const getAllSchedule = async (req, res) => {
    try {
        const { tender_id } = req.params;

        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.getPopulatedScheduleAll(tender_id);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};

export const getDailySchedule = async (req, res) => {
    try {
        const { tender_id } = req.params;

        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.getPopulatedScheduleDaily(tender_id);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};



export const updateRowSchedule = async (req, res) => {
    try {
        const { tender_id  } = req.params;
        const payload = req.body;


        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.updateRowSchedule(tender_id, payload);

        return res.status(200).json({
            status: true,
            data: data
        }); 

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};

export const updateDailyQuantity = async (req, res) => {
    try {
        const { tender_id  } = req.params;
        const payload = req.body;


        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.updateDailyQuantity(tender_id, payload);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};

export const updateDailyQuantityBulk = async (req, res) => {
    try {
        const { tender_id  } = req.params;
        const payload = req.body;


        if (!tender_id) {
            return res.status(400).json({ status: false, message: "Tender ID is required" });
        }

        const data = await ScheduleLiteService.bulkUpdateDailyQuantities(tender_id, payload);

        return res.status(200).json({
            status: true,
            data: data
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};


