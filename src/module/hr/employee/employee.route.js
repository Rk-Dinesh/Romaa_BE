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
  getEmployeesWithRoles,
  assignProjects,
  forgotPassword,
  resetPasswordWithOTP,
  mobileLogin,
  getAssignedEmployees
} from "./employee.controller.js";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { createRateLimiter } from "../../../common/rateLimiter.js";

const employeeRoute = Router();

// Rate limiters: 10 login attempts per 15 min, 5 OTP attempts per hour
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many login attempts. Try again in 15 minutes." });
const otpLimiter  = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5,  message: "Too many OTP requests. Try again in 1 hour." });

// --- Auth Routes ---
employeeRoute.post("/login", loginLimiter, login);
employeeRoute.post("/mobile-login", loginLimiter, mobileLogin);
employeeRoute.post("/logout", logout);
employeeRoute.post("/register", createEmployee); // Creating a new user is essentially registration

// --- Employee CRUD ---
// Assuming you will protect these with verifyJWT later
employeeRoute.get("/list", getAllEmployees); // ?page=1&limit=10&search=john
employeeRoute.get("/getbyId/:employeeId", getEmployeeById);
employeeRoute.put("/update/:employeeId", updateEmployee);
employeeRoute.delete("/delete/:employeeId", deleteEmployee);

// --- Role Management ---

employeeRoute.get("/role/filter", getUsersByRole); // Query: ?role=ADMIN

employeeRoute.get("/with-roles", getEmployeesWithRoles); // 1. Has Role
employeeRoute.get("/unassigned", getUnassignedEmployees); // 2. No Role (Lite data)
employeeRoute.get("/assigned", getAssignedEmployees); // 2. No Role (Lite data)

// --- Update Operations ---
employeeRoute.put("/update-access/:employeeId", updateEmployeeAccess); // 3. Update Role/Site/Status
employeeRoute.put("/role/re-assign", assignRole); // Body: { employeeId, roleId }
employeeRoute.put("/assign-projects", assignProjects); // Body: { employeeId, assignedProject: [projectId] }
employeeRoute.post("/reset-password",verifyJWT, resetPassword);
employeeRoute.post("/forgot-password", otpLimiter, forgotPassword);
employeeRoute.post("/reset-password-with-otp", otpLimiter, resetPasswordWithOTP);

export default employeeRoute;