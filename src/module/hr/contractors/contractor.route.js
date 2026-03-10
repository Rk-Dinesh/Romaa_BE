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
  getAllContractorsSelect,
  getContractorWithEmployees,
  getContractorEmployeesPaginated,
  assignProject,
  removeProject,
  getAssignedProjects,
  updateAccountDetails,
  getDashboardStats,
} from "./contractor.controller.js";

const contractorRoute = Router();

// Dashboard
contractorRoute.get("/dashboard-stats", getDashboardStats);

// Create
contractorRoute.post("/add", createContractor);

// Read
contractorRoute.get("/getall", getAllContractors);
contractorRoute.get("/getallselect", getAllContractorsSelect);
contractorRoute.get("/getactive", getActiveContractors);
contractorRoute.get("/contractorlist", getContractorsPaginated);
contractorRoute.get("/search", searchContractors);
contractorRoute.get("/get/:contractor_id", getContractorById);

// Contractor → Employees
contractorRoute.get("/get/:contractor_id/employees", getContractorWithEmployees);
contractorRoute.get("/get/:contractor_id/employees/paginated", getContractorEmployeesPaginated);

// Contractor → Projects
contractorRoute.get("/get/:contractor_id/projects", getAssignedProjects);
contractorRoute.post("/get/:contractor_id/assign-project", assignProject);
contractorRoute.put("/get/:contractor_id/remove-project/:tender_id", removeProject);

// Contractor → Account
contractorRoute.put("/update/:contractor_id/account", updateAccountDetails);

// Update & Delete
contractorRoute.put("/update/:contractor_id", updateContractor);
contractorRoute.delete("/delete/:contractor_id", deleteContractor);

export default contractorRoute;
