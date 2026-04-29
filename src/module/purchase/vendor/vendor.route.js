import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  createVendor,
  getAllVendors,
  getVendorById,
  getActiveVendors,
  updateVendor,
  deleteVendor,
  searchVendors,
  getVendorsPaginated,
  getAllVendorsSelect
} from "./vendor.controller.js";

const vendorRoute = Router();
vendorRoute.use(verifyJWT);

// Create
vendorRoute.post("/addvendor", createVendor);

// Read
vendorRoute.get("/getallvendors", getAllVendors);
vendorRoute.get("/getallvendorsselect", getAllVendorsSelect);
vendorRoute.get("/getvendor/:vendor_id", getVendorById);
vendorRoute.get("/getactivevendors", getActiveVendors);

// Search
vendorRoute.get("/searchvendors", searchVendors);

// Update
vendorRoute.put("/updatevendor/:vendor_id", updateVendor);

// Delete
vendorRoute.delete("/deletevendor/:vendor_id", deleteVendor);

vendorRoute.get("/getvendors", getVendorsPaginated);

export default vendorRoute;
