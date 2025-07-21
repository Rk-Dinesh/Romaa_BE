import logger from "../../config/logger.js";
import RoleService from "./role.service.js";


export const createRole = async() => {
 try {
    const userRole = req.body;
    const newRole = await RoleService.addRole(userRole);
    res.status(200).json({ message: 'User roles Created successfully' });
 } catch (error) {
    res.status(500).json({ message: 'Error while adding the Roles' + error });
 }
}

export const getRoleById = async (req, res) => {
  try {
    const roleId = req.params.id;
    let role = await RoleService.getRolesById(roleId);
    res.status(200).json(role);
  } catch (error) {
    logger.error(`Error while getting the role: ${error.message}`);
    res.status(500).json({ message: 'Error while getting the Role by ID' + error });
  }
};