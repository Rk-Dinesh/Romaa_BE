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
  uploadBidCSV,
  freezeBid
} from "./bid.controller.js";

const upload = multer({ dest: "uploads/" });
const bidRouter = Router();


bidRouter.post("/add", createBid); //not in use
bidRouter.get("/all", getAllBids); //not in use
bidRouter.get("/get", getBidById);
bidRouter.put("/update/:bid_id", updateBid); //not in use
bidRouter.delete("/delete/:bid_id", deleteBid); //not in use

bidRouter.post("/additem/:bid_id", addItemToBid); //not in use
bidRouter.delete("/removeitem/:bid_id/:item_code", removeItemFromBid); //not in use
bidRouter.post("/uploadcsv", upload.single("file"), uploadBidCSV);
bidRouter.put("/freeze/:tender_id", freezeBid);

export default bidRouter;
