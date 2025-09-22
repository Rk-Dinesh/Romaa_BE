import { Router } from "express";
import multer from "multer";
import {
  createBid,
  getAllBids,
  getBidById,
  updateBid,
  deleteBid,
  addItemToBid,
  removeItemFromBid,
  uploadBidCSV
} from "./bid.controller.js";

const upload = multer({ dest: "uploads/" });
const bidRouter = Router();


bidRouter.post("/add", createBid);
bidRouter.get("/all", getAllBids);
bidRouter.get("/get/:bid_id", getBidById);
bidRouter.put("/update/:bid_id", updateBid);
bidRouter.delete("/delete/:bid_id", deleteBid);

bidRouter.post("/additem/:bid_id", addItemToBid);
bidRouter.delete("/removeitem/:bid_id/:item_code", removeItemFromBid);
bidRouter.post("/uploadcsv", upload.single("file"), uploadBidCSV);

export default bidRouter;
