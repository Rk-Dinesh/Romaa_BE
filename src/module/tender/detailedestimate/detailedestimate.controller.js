import detailedestimateService from "./detailedestimate.service.js";
import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const detailedEstimateCustomHeading = async (req, res) => {
  try {
    const tender_id = req.query;
    const result = await detailedestimateService.createDetailedEstimateCustomHeadings(tender_id,req.body);
    res.status(200).json({ status: true, message: "Custom heading added successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const extractHeadingInpairs = async(req,res)=>{
    try {
        const tender_id = req.query;
        const result = await detailedestimateService.extractHeadingsInPairs(tender_id);
        res.status(200).json({ status: true, message: "Custom heading pairs extracted successfully", data: result });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
}


export const bulkInsertCustomHeadingsController = async (req, res, next) => {
  try {
    const {tender_id }= req.query;
    const {  nametype } = req.body;

    if (!req.file) return res.status(400).json({ status: false, message: "CSV file is required" });
    if (!tender_id) return res.status(400).json({ status: false, message: "tender_id is required" });
    if (!nametype) return res.status(400).json({ status: false, message: "nametype is required" });

    const filePath = path.join(__dirname, "../../../../uploads", req.file.filename);
    const csvRows = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => csvRows.push(row))
      .on("end", async () => {
        try {
          const result = await detailedestimateService.bulkInsertCustomHeadingsFromCsv(
            tender_id,
            nametype,
            csvRows
          );
          res.status(200).json({ status: true, message: "Bulk insert successful", data: result });
        } catch (error) {
          next(error);
        } finally {
          fs.unlinkSync(filePath); // clean up uploaded file
        }
      })
      .on("error", (err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
};

export const bulkInsertHeadingsController = async (req, res, next) => {
  try {
    const {tender_id }= req.query;
    const {  nametype } = req.body;

    if (!req.file) return res.status(400).json({ status: false, message: "CSV file is required" });
    if (!tender_id) return res.status(400).json({ status: false, message: "tender_id is required" });
    if (!nametype) return res.status(400).json({ status: false, message: "nametype is required" });

    const filePath = path.join(__dirname, "../../../../uploads", req.file.filename);
    const csvRows = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => csvRows.push(row))
      .on("end", async () => {
        try {
          const result = await detailedestimateService.bulkInsert(
            tender_id,
            nametype,
            csvRows
          );
          res.status(200).json({ status: true, message: "Bulk insert successful", data: result });
        } catch (error) {
          next(error);
        } finally {
          fs.unlinkSync(filePath); // clean up uploaded file
        }
      })
      .on("error", (err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
};

export const getCustomHeadingsByTenderAndNameTypeController = async (req, res, next) => {
  try {
    const { tender_id, nametype } = req.query;

    const data = await detailedestimateService.getCustomHeadingsByTenderAndNameTypeService(tender_id, nametype);

    return res.status(200).json({
      status: true,
      message: "Data retrieved successfully",
      data,
    });
  } catch (error) {
    return res.status(404).json({
      status: false,
      message: error.message,
    });
  }
};

export const getHeadingsByTenderAndNameTypeController = async (req, res, next) => {
  try {
    const { tender_id, nametype } = req.query;

    const data = await detailedestimateService.getHeadingsByTenderAndNameTypeService(tender_id, nametype);

    return res.status(200).json({
      status: true,
      message: "Data retrieved successfully",
      data,
    });
  } catch (error) {
    return res.status(404).json({
      status: false,
      message: error.message,
    });
  }
};
