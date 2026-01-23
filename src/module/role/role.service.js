import IdcodeServices from "../idcode/idcode.service.js";
import RoleModel from "./role.model.js";


class RoleService {

  // --- 1. Create New Role ---
  static async createRole(roleData) {
    // Generate Custom Role ID (e.g., ROL-001)
    const idname = "ROLE";
    const idcode = "ROL";

    // Ensure the ID config exists in your Idcode system
    await IdcodeServices.addIdCode(idname, idcode);

    // Generate the specific ID
    const role_id = await IdcodeServices.generateCode(idname);

    if (!role_id) throw new Error("Failed to generate Role ID");

    const newRole = new RoleModel({
      role_id,
      ...roleData
    });

    return await newRole.save();
  }

  // --- 2. Get All Roles ---
  static async getAllRoles() {
    // 1. Fetch raw data
    const roles = await RoleModel.find({ isActive: true })
      .select("role_id roleName description permissions createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // 2. Transform to calculate counts
    const simplifiedRoles = roles.map((role) => {
      let totalPermissions = 0;
      let accessibleModules = 0;

      // Iterate through each top-level module (Dashboard, Tender, HR, etc.)
      Object.values(role.permissions || {}).forEach((moduleData) => {
        let isModuleActive = false;

        // Recursive function to count 'true' values deeply
        const countTrueValues = (obj) => {
          if (!obj) return;

          Object.values(obj).forEach((val) => {
            if (val === true) {
              totalPermissions++; // Increment total checkmarks
              isModuleActive = true; // Mark this module as "Used"
            } else if (typeof val === "object" && val !== null) {
              countTrueValues(val); // Dig deeper into sub-modules
            }
          });
        };

        countTrueValues(moduleData);

        // If this module had at least one 'true', increment module count
        if (isModuleActive) {
          accessibleModules++;
        }
      });

      // 3. Return Clean Object with Numbers
      return {
        _id: role._id,
        role_id: role.role_id,
        roleName: role.roleName,
        description: role.description,
        moduleAccess: accessibleModules, // e.g., 5
        totalPermissions: totalPermissions, // e.g., 63
        createdAt: role.createdAt
      };
    });

    return simplifiedRoles;
  }

  static async getAllRolesForUserDropdown() {
    // 1. Fetch raw data
    const roles = await RoleModel.find({ isActive: true })
      .select("role_id roleName description")
      .sort({ createdAt: -1 })
      .lean();

    return roles;
  }

  // --- 3. Get Role by ID (Custom role_id) ---
  static async getRoleById(role_id) {
    return await RoleModel.findOne({ role_id });
  }

  // --- 4. Update Role ---
  static async updateRole(role_id, updateData) {
    // We use $set to allow partial updates of the nested permissions object
    // Mongoose handles deep merging with $set if passed correctly, 
    // or replacing specific fields if the structure matches.
    return await RoleModel.findOneAndUpdate(
      { role_id },
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }

  // --- 5. Delete Role (Soft Delete) ---
  static async deleteRole(role_id) {
    // Soft delete is recommended for RBAC to prevent breaking users assigned to this role
    return await RoleModel.findOneAndUpdate(
      { role_id },
      { isActive: false },
      { new: true }
    );

    // If you prefer hard delete, uncomment below:
    // return await RoleModel.findOneAndDelete({ role_id });
  }
}

export default RoleService;