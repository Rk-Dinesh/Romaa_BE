import detailedestimateService from "./detailedestimate.service.js";
import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { fileURLToPath } from "url";
import { parseFileToJson } from "../../../../utils/parseFileToJson.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const detailedEstimateCustomHeading = async (req, res) => {
  try {
    const { tender_id } = req.query;
    const result =
      await detailedestimateService.createDetailedEstimateCustomHeadings(
        { tender_id },
        req.body,
      );
    res
      .status(200)
      .json({
        status: true,
        message: "Detailed Estimate custom heading added successfully.",
        data: result,
      });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};

export const extractHeadingInpairs = async (req, res) => {
  try {
    const { tender_id } = req.query;
    const result =
      await detailedestimateService.extractHeadingsInPairs({ tender_id });
    res
      .status(200)
      .json({
        status: true,
        message: "Detailed Estimate heading pairs retrieved successfully.",
        data: result,
      });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const bulkInsertCustomHeadingsController = async (req, res) => {
  try {
    const { tender_id } = req.query;
    const { nametype } = req.body;

    if (!req.file)
      return res
        .status(400)
        .json({ status: false, message: "No file uploaded. Please attach a valid CSV file." });
    if (!tender_id)
      return res
        .status(400)
        .json({ status: false, message: "Tender ID is required." });
    if (!nametype)
      return res
        .status(400)
        .json({ status: false, message: "Section type (nametype) is required." });

    const filePath = path.join(
      __dirname,
      "../../../../uploads",
      req.file.filename,
    );
    const csvRows = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => csvRows.push(row))
      .on("end", async () => {
        try {
          const result =
            await detailedestimateService.bulkInsertCustomHeadingsFromCsv(
              tender_id,
              nametype,
              csvRows,
            );
          res
            .status(200)
            .json({
              status: true,
              message: "Detailed Estimate data imported successfully.",
              data: result,
            });
        } catch (error) {
          return res
            .status(400)
            .json({ status: false, message: error.message });
        } finally {
          fs.unlinkSync(filePath);
        }
      })
      .on("error", (err) => {
        return res.status(400).json({ status: false, message: err.message });
      });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

export const bulkInsertCustomHeadingsControllerNew = async (req, res, next) => {
  let filePath = null;
  try {
    if (!req.file) return res.status(400).json({ status: false, message: "No file uploaded. Please attach a valid CSV or Excel file." });
    const { tender_id } = req.query;
    const { nametype } = req.body;
    if (!tender_id)
      return res.status(400).json({ status: false, message: "Tender ID is required." });
    filePath = path.join(
      __dirname,
      "../../../../uploads",
      req.file.filename,
    );

    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, message: "The uploaded file is empty. Please provide a file with valid Detailed Estimate data." });
    }

    const result =
      await detailedestimateService.bulkInsertCustomHeadingsFromCsvNew(
        tender_id,
        nametype,
        dataRows,
      );
    res
      .status(200)
      .json({
        status: true,
        message: "Detailed Estimate data uploaded and processed successfully.",
        data: result,
      });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
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

export const getCustomHeadingsByTenderAndNameTypeController = async (
  req,
  res,
  next,
) => {
  try {
    const { tender_id, nametype } = req.query;
    const data =
      await detailedestimateService.getCustomHeadingsByTenderAndNameTypeService(
        tender_id,
        nametype,
      );
    return res
      .status(200)
      .json({ status: true, data });
  } catch (error) {
    return res.status(404).json({ status: false, message: error.message });
  }
};

export const getGeneralAbstractController = async (req, res) => {
  try {
    const { tender_id } = req.query;
    const data =
      await detailedestimateService.getGeneralAbstractService(tender_id);
    return res
      .status(200)
      .json({ status: true, data });
  } catch (error) {
    return res.status(404).json({ status: false, message: error.message });
  }
};

export const getBillOfQtyController = async (req, res) => {
  try {
    const { tender_id } = req.query;
    const data = await detailedestimateService.getBillOfQtyService(tender_id);
    return res
      .status(200)
      .json({ status: true, data });
  } catch (error) {
    return res.status(404).json({ status: false, message: error.message });
  }
};

export const addPhaseBreakdownToAbstractController = async (req, res) => {
  try {
    const { tender_id, nametype } = req.query;
    const { description, phase, quantity } = req.body;
    const data =
      await detailedestimateService.addPhaseBreakdownToAbstractService(
        tender_id,
        nametype,
        description,
        phase,
        quantity,
      );
    return res
      .status(200)
      .json({
        status: true,
        message: "Phase breakdown updated successfully",
        data,
      });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

export const addPhaseBreakdownToDetailedController = async (req, res) => {
  try {
    const { tender_id, nametype } = req.query;
    const { description, phase, quantity } = req.body;
    const data =
      await detailedestimateService.addPhaseBreakdownToDetailedService(
        tender_id,
        nametype,
        description,
        phase,
        quantity,
      );
    return res
      .status(200)
      .json({
        status: true,
        message: "Phase breakdown updated successfully",
        data,
      });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};
