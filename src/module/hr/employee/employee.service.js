import EmployeeModel from "./employee.model.js"; 
import IdcodeServices from "../../idcode/idcode.service.js"; 
import RoleModel from "../../role/role.model.js";
import bcrypt from "bcrypt";

class EmployeeService {
  
  // --- 1. Create New Employee (Register) ---
  static async addEmployee(employeeData) {
    // A. Generate Custom ID (EMP-001)
    const idname = "EMPLOYEE";
    const idcode = "EMP";
    // Ensure ID config exists
    await IdcodeServices.addIdCode(idname, idcode); 
    const employeeId = await IdcodeServices.generateCode(idname); 
    
    if (!employeeId) throw new Error("Failed to generate employee ID");

    // B. Check if Role exists
    if (employeeData.role) {
      const roleExists = await RoleModel.findById(employeeData.role);
      if (!roleExists) throw new Error("Invalid Role ID provided");
    }

    // C. Create User
    const employee = new EmployeeModel({
      ...employeeData,
      employeeId: employeeId, // Assign generated ID
    });

    return await employee.save();
  }

  // --- 2. Login Logic ---
  static async loginUser(email, password) {
    // A. Find User
    const user = await EmployeeModel.findOne({ email }).select("+password").populate("role");
    if (!user) throw new Error("User does not exist");

    // B. Check Password
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) throw new Error("Invalid user credentials");

    // C. Generate Tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // D. Save Refresh Token to DB (Optional but good for security)
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Remove sensitive fields from response
    const loggedInUser = await EmployeeModel.findById(user._id)
        .select("-password -refreshToken")
        .populate("role");

    return { user: loggedInUser, accessToken, refreshToken };
  }

  // --- 3. Role Management ---
  
  // Re-Assign Role to User
static async assignRoleToUser(employeeId, roleId) {
  let updateData = {};

  if (roleId !== null) {
    // --- CASE 1: Assigning a Role ---
    // Validate role exists
    const role = await RoleModel.findById(roleId);
    if (!role) throw new Error("Role not found");
    
    // Only update the role, keep existing password (if any)
    updateData = { role: roleId };

  } else {
    // --- CASE 2: Revoking Access (roleId is null) ---
    // Set both Role and Password to null
    updateData = { 
        role: null, 
        password: null 
    };
  }

  const updatedEmployee = await EmployeeModel.findOneAndUpdate(
    { employeeId: employeeId },
    { $set: updateData },
    { new: true }
  ).populate("role");

  if (!updatedEmployee) throw new Error("Employee not found");

  return updatedEmployee;
}

  // Get Users by Specific Role (e.g., Get all "Site Engineers")
  static async getUsersByRole(roleName) {
    // First find the Role ID by name
    const role = await RoleModel.findOne({ roleName: roleName.toUpperCase() });
    if (!role) throw new Error("Role not found");

    return await EmployeeModel.find({ role: role._id }).select("-password");
  }

  // --- 4. Standard CRUD ---

  static async getAllEmployees() {
    return await EmployeeModel.find().select("-password").populate("role");
  }

  static async getEmployeeById(employeeId) {
    return await EmployeeModel.findOne({ employeeId }).select("-password").populate("role");
  }

  static async updateEmployee(employeeId, updateData) {
    return await EmployeeModel.findOneAndUpdate(
      { employeeId },
      { $set: updateData },
      { new: true }
    ).select("-password");
  }

  static async deleteEmployee(employeeId) {
    return await EmployeeModel.findOneAndDelete({ employeeId });
  }

  // --- 5. Pagination & Search ---
  static async getEmployeesPaginated(page, limit, search) {
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } }
      ];
    }

    const total = await EmployeeModel.countDocuments(query);
    const employees = await EmployeeModel.find(query)
      .select("-password")
      .populate("role")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return { total, employees };
  }

static async getEmployeesWithRoles() {
  // Filter where role is NOT null
  return await EmployeeModel.find({ role: { $ne: null } })
    .populate("role", "role_id roleName") 
    .sort({ createdAt: -1 });
}

  static async getUnassignedEmployees() {
    // Filter where role IS null
    // Select only specific fields: _id, employeeId, name
    return await EmployeeModel.find({ role: null })
      .select("employeeId name email") 
      .lean();
  }

static async updateEmployeeAccess(employeeId, { role, status, password }) {
    const updateData = {};

    if (role) updateData.role = role;
    if (status) updateData.status = status;

    // ✅ Hash password before adding to updateData
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedEmployee = await EmployeeModel.findOneAndUpdate(
      { employeeId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate("role");

    if (!updatedEmployee) throw new Error("Employee not found");
    return updatedEmployee;
}

  static async resetPassword(userId, oldPassword, newPassword) {
    // 1. Find user and explicitly select password (hidden by default)
    const employee = await EmployeeModel.findOne({ employeeId: userId }).select("+password");
    if (!employee) throw new Error("Employee not found");

    // 2. Check if old password is correct
    const isMatch = await bcrypt.compare(oldPassword, employee.password);
    if (!isMatch) throw new Error("Incorrect old password");

    // 3. Assign new password (The pre('save') middleware in Model will hash it)
    employee.password = newPassword;
    await employee.save();

    return true;
  }
}

export default EmployeeService;