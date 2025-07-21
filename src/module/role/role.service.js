import RoleModel from "./role.model.js";
import logger from "../../config/logger.js";

class RoleService {
  static async addRole(userRole) {
    try {
      const newRoles = new RoleModel({
        ...userRole,
      });

      const role = await newRoles.save();
      return role;
    } catch (error) {
    logger.error("error while adding a role" + error);
      console.log("Error in creating Role");
    }
  }
  static async getRolesById(roleId) {
    try {
      return await RoleModel.findById({ _id: roleId });
    } catch (error) {
      console.log("Error in creating Role");
      logger.error("error while getting a role" + error);
    }
  }
}

export default RoleService;
