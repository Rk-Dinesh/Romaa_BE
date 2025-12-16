import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import BidService from "./bid.service.js";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createBid = async (req, res) => {
  try {
    const result = await BidService.addBid(req.body);
    res.status(201).json({ status: true, message: "Bid created successfully", data: result });
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
    if (!result) return res.status(404).json({ status: false, message: "Bid not found" });
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateBid = async (req, res) => {
  try {
    const result = await BidService.updateBid(req.params.bid_id, req.body);
    res.status(200).json({ status: true, message: "Bid updated successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteBid = async (req, res) => {
  try {
    const result = await BidService.deleteBid(req.params.bid_id);
    res.status(200).json({ status: true, message: "Bid deleted successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const addItemToBid = async (req, res) => {
  try {
    const result = await BidService.addItemToBid(req.params.bid_id, req.body);
    res.status(200).json({ status: true, message: "Item added to Bid", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const removeItemFromBid = async (req, res) => {
  try {
    const result = await BidService.removeItemFromBid(req.params.bid_id, req.params.item_code);
    res.status(200).json({ status: true, message: "Item removed from Bid", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const uploadBidCSV = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { created_by_user, tender_id, phase, revision, prepared_by, approved_by } = req.body;
    if (!created_by_user) return res.status(400).json({ error: "created_by_user is required" });
    if (!tender_id) return res.status(400).json({ error: "tender_id is required" });
    const parsedRevision = revision ? Number(revision.toString().trim()) : 1;
    if (isNaN(parsedRevision)) {
      return res.status(400).json({ error: "revision must be a valid number" });
    }

    const csvRows = [];
    const filePath = path.join(__dirname, "../../../../uploads", req.file.filename);

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => csvRows.push(row))
      .on("end", async () => {
        try {
          const result = await BidService.bulkInsert(
            csvRows,
            created_by_user,
            tender_id,
            phase,
            parsedRevision,
            prepared_by,
            approved_by
          );
          res.status(200).json({ status: true, message: "CSV data uploaded successfully", data: result });
        } catch (error) {
          next(error);
        } finally {
          fs.unlinkSync(filePath); // Delete the uploaded file
        }
      });
  } catch (error) {
    next(error);
  }
};

export const freezeBid = async (req, res) => {
  try {
    const result = await BidService.freezeBid(req.params.tender_id);
    res.status(200).json({ status: true, message: "Bid frozen successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
