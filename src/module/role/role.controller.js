import RoleService from "./role.service.js";

// 1. Create Role
export const createRole = async (req, res) => {
  try {
    const { roleName, description, permissions } = req.body;
    
    if (!roleName) {
      return res.status(400).json({ status: false, message: "Role Name is required" });
    }

console.log(req.user, "req.user");
    // Pass the payload to service
    const data = await RoleService.createRole({ 
      roleName, 
      description, 
      permissions,
      createdBy: req.user?._id 
    });

    res.status(201).json({ status: true, message: "Role created successfully", data });
  } catch (error) {
    // Handle duplicate key error (E11000) for roleName or role_id
    if (error.code === 11000) {
      return res.status(400).json({ status: false, message: "Role Name or ID already exists" });
    }
    res.status(500).json({ status: false, message: error.message });
  }
};

// 2. Get All Roles
export const getAllRoles = async (req, res) => {
  try {
    const data = await RoleService.getAllRoles();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

//  Get All Roles for User Dropdown
export const getAllRolesForUserDropdown = async (req, res) => {
  try {
    const data = await RoleService.getAllRolesForUserDropdown();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 3. Get Single Role
export const getRoleById = async (req, res) => {
  try {
    const data = await RoleService.getRoleById(req.params.role_id);
    if (!data) return res.status(404).json({ status: false, message: "Role not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 4. Update Role
export const updateRole = async (req, res) => {
  try {
    const data = await RoleService.updateRole(req.params.role_id, req.body);
    if (!data) return res.status(404).json({ status: false, message: "Role not found" });
    res.status(200).json({ status: true, message: "Role updated successfully", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 5. Delete Role
export const deleteRole = async (req, res) => {
  try {
    const data = await RoleService.deleteRole(req.params.role_id);
    if (!data) return res.status(404).json({ status: false, message: "Role not found" });
    res.status(200).json({ status: true, message: "Role deleted (deactivated) successfully" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};