import { Router } from "express";
import {
  createContractor,
  getAllContractors,
  getContractorById,
  getActiveContractors,
  updateContractor,
  deleteContractor,
  searchContractors,
  getContractorsPaginated,
  getAllContractorsSelect
} from "./contractor.controller.js";

const contractorRoute = Router();

// Create
contractorRoute.post("/add", createContractor);

// Read
contractorRoute.get("/getall", getAllContractors);
contractorRoute.get("/getallselect", getAllContractorsSelect);
contractorRoute.get("/get/:contractor_id", getContractorById);
contractorRoute.get("/getactive", getActiveContractors);

// Search
contractorRoute.get("/search", searchContractors);

// Update
contractorRoute.put("/update/:contractor_id", updateContractor);

// Delete
contractorRoute.delete("/delete/:contractor_id", deleteContractor);

// Paginated
contractorRoute.get("/contractorlist", getContractorsPaginated);

export default contractorRoute;
