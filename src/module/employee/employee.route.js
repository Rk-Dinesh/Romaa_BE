import { Router } from "express";
import {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  getActiveEmployees,
  updateEmployee,
  deleteEmployee,
  searchEmployees,
  getEmployeesPaginated,
  markAttendance,
  updateAttendance,
  getAttendance
} from "./employee.controller.js";

const employeeRoute = Router();

// Create
employeeRoute.post("/add", createEmployee);

// Read
employeeRoute.get("/getallemployees", getAllEmployees);
employeeRoute.get("/getemployee/:employee_id", getEmployeeById);
employeeRoute.get("/getactiveemployees", getActiveEmployees);

// Search
employeeRoute.get("/searchemployees", searchEmployees);

// Update
employeeRoute.put("/updateemployee/:employee_id", updateEmployee);

// Delete
employeeRoute.delete("/deleteemployee/:employee_id", deleteEmployee);

// Paginated, Search, Date filtered
employeeRoute.get("/getemployees", getEmployeesPaginated);

employeeRoute.post("/markattendance/:employee_id", markAttendance);
employeeRoute.put("/updateattendance/:employee_id", updateAttendance);
employeeRoute.get("/getattendance/:employee_id", getAttendance);

export default employeeRoute;
