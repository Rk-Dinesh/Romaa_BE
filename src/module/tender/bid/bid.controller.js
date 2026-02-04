import fs from "fs";
import path from "path";
import BidService from "./bid.service.js";
import { fileURLToPath } from "url";
import { parseFileToJson } from "../../../../utils/parseFileToJson.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const createBid = async (req, res) => {
  try {
    const result = await BidService.addBid(req.body);
    res
      .status(201)
      .json({
        status: true,
        message: "Bid created successfully",
        data: result,
      });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllBids = async (req, res) => {
  try {
    const result = await BidService.getAllBids();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getBidById = async (req, res) => {
  try {
    const result = await BidService.getBidById(req.query.tender_id);
    if (!result)
      return res.status(404).json({ status: false, message: "Bid not found" });
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateBid = async (req, res) => {
  try {
    const result = await BidService.updateBid(req.params.bid_id, req.body);
    res
      .status(200)
      .json({
        status: true,
        message: "Bid updated successfully",
        data: result,
      });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteBid = async (req, res) => {
  try {
    const result = await BidService.deleteBid(req.params.bid_id);
    res
      .status(200)
      .json({
        status: true,
        message: "Bid deleted successfully",
        data: result,
      });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const addItemToBid = async (req, res) => {
  try {
    const result = await BidService.addItemToBid(req.params.bid_id, req.body);
    res
      .status(200)
      .json({ status: true, message: "Item added to Bid", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const removeItemFromBid = async (req, res) => {
  try {
    const result = await BidService.removeItemFromBid(
      req.params.bid_id,
      req.params.item_code,
    );
    res
      .status(200)
      .json({ status: true, message: "Item removed from Bid", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const uploadBidCSV = async (req, res, next) => {
  let filePath = null;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const {
      created_by_user,
      tender_id,
      phase,
      revision,
      prepared_by,
      approved_by,
    } = req.body;
    if (!created_by_user)
      return res.status(400).json({ error: "created_by_user is required" });
    if (!tender_id)
      return res.status(400).json({ error: "tender_id is required" });
    const parsedRevision = revision ? Number(revision.toString().trim()) : 1;
    if (isNaN(parsedRevision)) {
      return res.status(400).json({ error: "revision must be a valid number" });
    }
    filePath = path.join(__dirname, "../../../../uploads", req.file.filename);

    const dataRows = await parseFileToJson(filePath, req.file.originalname);

    if (dataRows.length === 0) {
      return res.status(400).json({ status: false, error: "File is empty" });
    }

    const result = await BidService.bulkInsert(
      dataRows,
      created_by_user,
      tender_id,
      phase,
      parsedRevision,
      prepared_by,
      approved_by,
    );
    res
      .status(200)
      .json({
        status: true,
        message: "CSV data uploaded successfully",
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

export const freezeBid = async (req, res) => {
  try {
    const result = await BidService.freezeBid(req.params.tender_id);
    res
      .status(200)
      .json({ status: true, message: "Bid frozen successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getBidItemsLite = async (req, res) => {
  try {
    const result = await BidService.getBidItemsLite(req.params.tender_id);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
