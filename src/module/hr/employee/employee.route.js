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
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { createRateLimiter } from "../../../common/rateLimiter.js";

const employeeRoute = Router();

// Rate limiters: 10 login attempts per 15 min, 5 OTP attempts per hour
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many login attempts. Try again in 15 minutes." });
const otpLimiter  = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5,  message: "Too many OTP requests. Try again in 1 hour." });

// --- Auth Routes (public) ---
employeeRoute.post("/login",        loginLimiter, login);
employeeRoute.post("/mobile-login", loginLimiter, mobileLogin);
employeeRoute.post("/logout",       logout);
employeeRoute.post("/forgot-password",        otpLimiter, forgotPassword);
employeeRoute.post("/reset-password-with-otp", otpLimiter, resetPasswordWithOTP);
employeeRoute.post("/reset-password", verifyJWT, resetPassword);

// --- Employee CRUD (HR protected) ---
employeeRoute.post("/register",  verifyJWT, verifyPermission("hr", "employee", "create"), createEmployee);
employeeRoute.get("/list",       verifyJWT, verifyPermission("hr", "employee", "read"),   getAllEmployees);
employeeRoute.get("/getbyId/:employeeId", verifyJWT, verifyPermission("hr", "employee", "read"), getEmployeeById);
employeeRoute.put("/update/:employeeId",  verifyJWT, verifyPermission("hr", "employee", "edit"), updateEmployee);
employeeRoute.delete("/delete/:employeeId", verifyJWT, verifyPermission("hr", "employee", "delete"), deleteEmployee);

// --- Role & Access Management (HR/Settings protected) ---
employeeRoute.get("/role/filter",     verifyJWT, verifyPermission("hr", "employee", "read"),   getUsersByRole);
employeeRoute.get("/with-roles",      verifyJWT, verifyPermission("hr", "employee", "read"),   getEmployeesWithRoles);
employeeRoute.get("/unassigned",      verifyJWT, verifyPermission("hr", "employee", "read"),   getUnassignedEmployees);
employeeRoute.get("/assigned",        verifyJWT, verifyPermission("hr", "employee", "read"),   getAssignedEmployees);
employeeRoute.put("/update-access/:employeeId", verifyJWT, verifyPermission("settings", "roles", "edit"), updateEmployeeAccess);
employeeRoute.put("/role/re-assign",  verifyJWT, verifyPermission("settings", "roles", "edit"), assignRole);
employeeRoute.put("/assign-projects", verifyJWT, verifyPermission("hr", "employee", "edit"),   assignProjects);

export default employeeRoute;
