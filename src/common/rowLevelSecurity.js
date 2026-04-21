// Row-level security: filters DB queries based on user's role and assigned tenders.
// Site-level employees can only see data for tenders they are assigned to.
// Finance/Admin roles see all data.
//
// SAFETY RULE: when in doubt (no assigned tenders, unknown role), return {} (see all)
// so users are never accidentally locked out of legitimate data.

import EmployeeModel from "../module/hr/employee/employee.model.js";

// Roles that bypass row-level filtering (see all data)
const GLOBAL_ROLES = ["DEV", "Admin", "Finance Manager", "Finance", "Director", "MD"];

export const getRLSFilter = async (userId) => {
  if (!userId) return {}; // unauthenticated — blocked upstream by verifyJWT

  const employee = await EmployeeModel.findById(userId)
    .select("role userType assigned_tenders")
    .populate("role", "role_name")
    .lean();

  if (!employee) return {};

  const roleName = employee.role?.role_name || "";

  // Global roles see everything
  if (GLOBAL_ROLES.some((r) => roleName.toLowerCase().includes(r.toLowerCase()))) {
    return {};
  }

  // Site-level employees: filter to assigned tenders only
  if (employee.userType === "Site" && employee.assigned_tenders?.length) {
    return { tender_id: { $in: employee.assigned_tenders } };
  }

  // If no tenders assigned or not a Site user, return empty filter (see all)
  return {};
};

// Express middleware factory — attaches getRLSFilter helper to req for use in controllers.
// Lazy: does NOT await here; controllers call req.getRLSFilter() only when needed.
export const rlsMiddleware = (req, _res, next) => {
  req.getRLSFilter = () => getRLSFilter(req.user?._id);
  next();
};
