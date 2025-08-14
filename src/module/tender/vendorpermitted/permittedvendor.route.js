import { Router } from "express";
import {
  addPermittedVendors,
  getPermittedVendors,
  updatePermittedVendor,
  removePermittedVendor,
  getpaginatedVendor
} from "./permittedvendor.controller.js";

const permittedrouter = Router();

// Add vendors to tender
permittedrouter.post("/add", addPermittedVendors);

// Get permitted vendors for a tender
permittedrouter.get("/gettender/:tender_id", getPermittedVendors);

// Update permitted vendor
permittedrouter.put("/update/:tender_id/:vendor_id", updatePermittedVendor);

// Remove permitted vendor (also removes from TenderModel)
permittedrouter.delete("/remove/:tender_id/:vendor_id", removePermittedVendor);

permittedrouter.get('/permitted-vendors/:tender_id',getpaginatedVendor)

export default permittedrouter;
