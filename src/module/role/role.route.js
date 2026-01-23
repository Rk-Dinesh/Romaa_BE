import { Router } from "express";
import {
  createRole,
  getAllRoles,
  getAllRolesForUserDropdown,
  getRoleById,
  updateRole,
  deleteRole
} from "./role.controller.js";
import { verifyJWT } from "../../common/Auth.middlware.js";

// Optional: Import Auth Middleware to protect these routes
// import { verifyJWT, verifyPermission } from "../../middleware/auth.middleware.js";

const roleRoute = Router();

// --- Role Management Endpoints ---

// Create a new Role
// Example protection: verifyJWT, verifyPermission('settings', 'roles', 'create')
roleRoute.post("/create",verifyJWT, createRole);

// List all Roles
roleRoute.get("/list", getAllRoles);

// List all Roles for User Dropdown
roleRoute.get("/listForDropdown", getAllRolesForUserDropdown);

// Get specific Role Details
roleRoute.get("/getbyId/:role_id", getRoleById);

// Update Role Permissions/Name
roleRoute.put("/update/:role_id", updateRole);

// Delete (Soft Delete) Role
roleRoute.delete("/delete/:role_id", deleteRole);

export default roleRoute;