import EmployeeModel from "./employee.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import RoleModel from "../../role/role.model.js";
import bcrypt from "bcrypt";
import TenderModel from "../../tender/tender/tender.model.js";
import { sendOTPEmail } from "../../../../utils/emailSender.js";

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
  static async assignRoleToUser(employeeId, roleId, accessMode) {
    const updateData = {}; // Initialize

    // 1. Set Access Mode
    if (accessMode) {
      updateData.accessMode = accessMode;
    }

    if (roleId) {
      // --- CASE 1: Assigning a Role ---
      // Validate role exists
      const role = await RoleModel.findById(roleId);
      if (!role) throw new Error("Role not found");
      updateData.role = roleId;

    } else {
      // --- CASE 2: Revoking Access (roleId is null) ---
      updateData.role = null;
      updateData.password = null;
      updateData.accessMode = null; // Optional: Reset access mode if revoking role
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
    return await EmployeeModel.findOne({ employeeId }).select("-password").populate("role").populate("assignedProject", "tender_id tender_project_name");
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

  static async updateEmployeeAccess(employeeId, { role, status, password, accessMode }) {
    const updateData = {};

    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (accessMode) updateData.accessMode = accessMode;
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
  /**
   * Assign multiple projects/sites to an employee
   * @param {String} employeeId - The unique Employee ID (e.g., EMP001)
   * @param {Array} projectIds - Array of MongoDB ObjectIds (strings)
   */
  static async assignProjectsToUser(employeeId, projectIds) {
    // 1. (Optional but recommended) Validate that all project IDs actually exist
    // This prevents adding invalid IDs to the employee record
    if (projectIds.length > 0) {
      const validProjects = await TenderModel.countDocuments({
        _id: { $in: projectIds }
      });

      if (validProjects !== projectIds.length) {
        throw new Error("One or more Site/Project IDs are invalid");
      }
    }

    // 2. Update the Employee
    const updatedEmployee = await EmployeeModel.findOneAndUpdate(
      { employeeId: employeeId },
      {
        $set: {
          assignedProject: projectIds
        }
      },
      { new: true, runValidators: true }
    )
      .populate("assignedProject", "tender_id tender_project_name") // Populate to return full details
      .populate("role", "roleName"); // Populate role if needed for context

    if (!updatedEmployee) {
      throw new Error("Employee not found");
    }

    return updatedEmployee;
  }

  static async forgotPassword(email) {
    // 1. Check if user exists
    const employee = await EmployeeModel.findOne({ email });

    if (!employee) {
      throw new Error("User with this email does not exist.");
    }

    if (employee.role === null) {
      throw new Error("User is not authorized to reset password.");
    }

    if (employee.status !== "Active") {
      throw new Error("Account is inactive. Contact Admin.");
    }

    // 2. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Set Expiration (5 Minutes from now)
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000);

    // 4. Save to Database
    employee.resetOTP = otp;
    employee.resetOTPExpires = expiryTime;
    await employee.save();

    // 5. Send Email via SMTP
    const emailSent = await sendOTPEmail(employee.email, employee.name, otp);

    if (!emailSent) {
      throw new Error("Failed to send OTP email. Please try again later.");
    }

    return { message: `OTP sent to ${email}` };
  }
  /**
   * Verify OTP and Set New Password
   * @param {String} email 
   * @param {String} otp 
   * @param {String} newPassword 
   */
  static async verifyOTPAndResetPassword(email, otp, newPassword) {
    // 1. Find User
    // We select '+resetOTP +resetOTPExpires' because they might not be selected by default in your schema
    const employee = await EmployeeModel.findOne({ email }).select("+resetOTP +resetOTPExpires");

    if (!employee) {
      throw new Error("User not found.");
    }

    // 2. Validate OTP Existence
    if (!employee.resetOTP) {
      throw new Error("No password reset requested.");
    }

    // 3. Check if OTP matches
    if (employee.resetOTP !== otp) {
      throw new Error("Invalid OTP.");
    }

    // 4. Check if OTP is expired
    // resetOTPExpires is a Date object. We compare it to current time.
    if (employee.resetOTPExpires < Date.now()) {
      // Optional: Clear expired OTP
      employee.resetOTP = null;
      employee.resetOTPExpires = null;
      await employee.save();
      
      throw new Error("OTP has expired. Please request a new one.");
    }

    employee.password = newPassword;
    employee.resetOTP = null;
    employee.resetOTPExpires = null;

    await employee.save();

    return { message: "Password reset successfully. You can now login." };
  }
}

export default EmployeeService;