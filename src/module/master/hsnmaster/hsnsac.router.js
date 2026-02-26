import express from "express";
import {
  createHsnSac,
  bulkUploadHsnSac,
  getAllHsnSac,
  getHsnSacById,
  updateHsnSac,
  deleteHsnSac,
  toggleHsnSacStatus,
} from "./hsnsac.controller.js";

import multer from "multer";

const upload = multer({ dest: "uploads/" });

// Optional: Import your auth middlewares here
// import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const hsnSacRouter = express.Router();

// --- API Endpoints ---
// Apply auth middlewares as needed, e.g., router.post("/", requireAuth, createHsnSac)

// 1. Create & Bulk Upload
hsnSacRouter.post("/", createHsnSac);
hsnSacRouter.post("/uploadcsv", upload.single("file"), bulkUploadHsnSac);

// 2. Read
hsnSacRouter.get("/getall", getAllHsnSac);
hsnSacRouter.get("/getbyid/:id", getHsnSacById);

// 3. Update
hsnSacRouter.put("/update/:id", updateHsnSac);
hsnSacRouter.patch("/toggle-status/:id", toggleHsnSacStatus); // Specialized patch for activating/deactivating

// 4. Delete
hsnSacRouter.delete("/delete/:id", deleteHsnSac);

export default hsnSacRouter;