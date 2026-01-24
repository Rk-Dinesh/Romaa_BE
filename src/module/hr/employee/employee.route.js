import { Router } from "express";
import {
  login,
  logout,
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  assignRole,
  getUsersByRole,
  updateEmployeeAccess,
  resetPassword,
  getUnassignedEmployees,
  getEmployeesWithRoles
} from "./employee.controller.js";
import { verifyJWT } from "../../../common/Auth.middlware.js";


// Optional: Import your Auth Middleware here
// import { verifyJWT } from "../../middleware/auth.middleware.js"; 

const employeeRoute = Router();

// --- Auth Routes ---
employeeRoute.post("/login", login);
employeeRoute.post("/logout", logout);
employeeRoute.post("/register", createEmployee); // Creating a new user is essentially registration

// --- Employee CRUD ---
// Assuming you will protect these with verifyJWT later
employeeRoute.get("/list", getAllEmployees); // ?page=1&limit=10&search=john
employeeRoute.get("/getbyId/:employeeId", getEmployeeById);
employeeRoute.put("/update/:employeeId", updateEmployee);
employeeRoute.delete("/delete/:employeeId", deleteEmployee);

// --- Role Management ---
employeeRoute.put("/role/re-assign", assignRole); // Body: { employeeId, roleId }
employeeRoute.get("/role/filter", getUsersByRole); // Query: ?role=ADMIN

employeeRoute.get("/with-roles", getEmployeesWithRoles); // 1. Has Role
employeeRoute.get("/unassigned", getUnassignedEmployees); // 2. No Role (Lite data)

// --- Update Operations ---
employeeRoute.put("/update-access/:employeeId", updateEmployeeAccess); // 3. Update Role/Site/Status
employeeRoute.post("/reset-password",verifyJWT, resetPassword);

export default employeeRoute;