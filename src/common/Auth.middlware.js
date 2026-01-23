import jwt from "jsonwebtoken";
import EmployeeModel from "../module/hr/employee/employee.model.js";


// --- 1. Authentication Middleware (Who are you?) ---
export const verifyJWT = async (req, res, next) => {
  try {
    // Get token from Cookie OR Header (Bearer token)
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ status: false, message: "Unauthorized request" });
    }

    // Verify Token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Find User & Populate Role (Crucial for RBAC)
    const user = await EmployeeModel.findById(decodedToken._id)
      .select("-password -refreshToken") // Exclude sensitive fields
      .populate("role"); // We need the role permissions attached to req.user

    if (!user) {
      return res.status(401).json({ status: false, message: "Invalid Access Token" });
    }

    // Attach user to request object
    req.user = user;
    next();
    
  } catch (error) {
    return res.status(401).json({ status: false, message: error.message || "Invalid Access Token" });
  }
};

// --- 2. Authorization Middleware (Are you allowed to do this?) ---
// Usage: verifyPermission('tender', 'tenders', 'create')
export const verifyPermission = (module, subModule, action = "read") => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(403).json({ status: false, message: "Access Denied: No Role Assigned" });
      }

      const permissions = req.user.role.permissions;

      // 1. Check if Module exists
      if (!permissions[module]) {
        return res.status(403).json({ status: false, message: "Access Denied: Module Restricted" });
      }

      // 2. Check Permission Logic
      let hasAccess = false;

      if (!subModule) {
        // Simple Module (e.g. Dashboard)
        hasAccess = permissions[module][action] === true;
      } else {
        // Nested Module (e.g. Tender -> Clients)
        // Check if submodule exists first
        if (permissions[module][subModule]) {
          hasAccess = permissions[module][subModule][action] === true;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ 
          status: false, 
          message: `Access Denied: You do not have '${action}' permission for ${module}/${subModule || ""}` 
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ status: false, message: "Authorization Error" });
    }
  };
};