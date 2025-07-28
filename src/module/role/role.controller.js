import logger from "../../config/logger.js";
import IdcodeServices from "../idcode/idcode.service.js";
import RoleModel from "./role.model.js";
import RoleService from "./role.service.js";

export const createRole = async (req, res) => {
  try {
    const { role_name, accessLevels, status, created_by_user } = req.body;
    const idname = "RoleAccess";
    const idcode = "RAC";
    const generateCode = await IdcodeServices.addIdCode(idname, idcode);
    const role_id = await IdcodeServices.generateCode(idname);
    if (!role_id) {
      throw new Error("Failed to generate user ID.");
    }

    accessLevels.forEach((accessLevel) => {
      if (!accessLevel.permissions || accessLevel.permissions.length === 0) {
        throw new Error(
          `Permissions array is empty for feature ${accessLevel.feature}`
        );
      }
    });

    const roleAccessLevel = new RoleModel({
      role_id,
      role_name,
      accessLevels,
      status,
      created_by_user,
    });

    const result = await roleAccessLevel.save();
    res.status(200).json({
      status: true,
      message: "Role access level created successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`Error creating role access level: ${error.message}`);
    res.status(500).json({
      status: false,
      message: "Error creating role access level",
      error: error.message,
    });
  }
};

export const getRoleById = async (req, res) => {
  const {roleId} = req.query;
  try {
    
    const role = await RoleService.getRolesById(roleId);
    res.status(200).json({
      status: true,
      message: "Role fetched successfully",
      data: role,
    });
  } catch (error) {
    logger.error(`Error while getting the role: ${error.message}`);
    res
      .status(500)
      .json({ message: "Error while getting the Role by ID" + error });
  }
};

export const getAllRoles = async (req, res) => {
  try {
    const roles = await RoleService.getAllRoles();
    res.status(200).json({
      status: true,
      message: "All roles fetched successfully",
      data: roles,
    });
  } catch (error) {
    logger.error(`Error while getting all roles: ${error.message}`);
    res.status(500).json({ message: "Error while getting all roles" + error });
  }
}

export const updateRoleById = async (req, res) => {
  const { roleId } = req.query;
  try {
    const update = req.body;
    const updated = await RoleService.updateRole(roleId, update);
    res.status(200).json({
      status: true,
      message: "Role updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error(`Error updating role: ${error.message}`);
    res.status(500).json({ message: "Error updating role" + error });
  }
};

export const deleteRoleById = async (req, res) => {
  const { roleId } = req.query;
  try {
    const deleted = await RoleService.deleteRole(roleId);
    if (!deleted) {
      return res.status(404).json({ message: "Role not found" });
    }
    res.status(200).json({
      status: true,
      message: "Role deleted successfully",
    });
  } catch (error) {
    logger.error(`Error deleting role: ${error.message}`);
    res.status(500).json({ message: "Error deleting role" + error });
  }
}
