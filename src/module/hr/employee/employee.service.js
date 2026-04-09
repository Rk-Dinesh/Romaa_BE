import EmployeeModel from "./employee.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import RoleModel from "../../role/role.model.js";
import bcrypt from "bcrypt";
import TenderModel from "../../tender/tender/tender.model.js";
import { sendOTPEmail } from "../../../../utils/emailSender.js";
import NotificationService from "../../notifications/notification.service.js";

class EmployeeService {

  // --- 1. Create New Employee (Register) ---
  static async addEmployee(employeeData) {
    // A. Generate Custom ID (EMP-001)
    const idname = "EMPLOYEE";
    const idcode = "EMP";
    // Ensure ID config exists
    await IdcodeServices.addIdCode(idname, idcode);
    const employeeId = await IdcodeServices.generateCode(idname);

    if (!employeeId) throw new Error("Unable to generate employee ID. Please contact the system administrator");

    // B. Check if Role exists
    if (employeeData.role) {
      const roleExists = await RoleModel.findById(employeeData.role);
      if (!roleExists) throw new Error("The specified role does not exist. Please select a valid role from the system");
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
    const user = await EmployeeModel.findOne({ email, isDeleted: { $ne: true } }).select("+password").populate("role");
    if (!user) throw new Error("No account found with this email address. Please check your credentials and try again");

    // B. Check Password
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) throw new Error("Incorrect password. Please verify your password and try again");

    // C. Generate Tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // D. Save Refresh Token to DB (Optional but good for security)
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Remove sensitive fields from response
    const loggedInUser = await EmployeeModel.findById(user._id)
      .select("-password -refreshToken")
      .populate("role")
      .populate("assignedProject", "tender_id tender_project_name site_location");

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
      if (!role) throw new Error("The specified role was not found in the system. Please verify the role ID and try again");
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

    if (!updatedEmployee) throw new Error("Employee record not found. Please verify the employee ID and try again");

    // Notify employee about role change
    if (roleId) {
      NotificationService.notify({
        title: "Role Assigned",
        message: `You have been assigned the role: ${updatedEmployee.role?.roleName || "New Role"}`,
        audienceType: "user",
        users: [updatedEmployee._id],
        category: "task",
        priority: "high",
        module: "hr",
        actionUrl: `/dashboard/profile`,
        actionLabel: "View Profile",
      });
    } else {
      NotificationService.notify({
        title: "Access Revoked",
        message: `Your system access has been revoked. Contact HR for details.`,
        audienceType: "user",
        users: [updatedEmployee._id],
        category: "alert",
        priority: "high",
        module: "hr",
      });
    }

    return updatedEmployee;
  }

  // Get Users by Specific Role (e.g., Get all "Site Engineers")
  static async getUsersByRole(roleName) {
    const role = await RoleModel.findOne({ roleName: roleName.toUpperCase() });
    if (!role) throw new Error("No role found matching the specified name. Please check the role name and try again");

    return await EmployeeModel.find({ role: role._id, isDeleted: { $ne: true } }).select("-password");
  }

  // --- 4. Standard CRUD ---

  static async getAllEmployees() {
    return await EmployeeModel.find({ isDeleted: { $ne: true } }).select("-password").populate("role");
  }

  static async getEmployeeById(employeeId) {
    return await EmployeeModel.findOne({ employeeId, isDeleted: { $ne: true } }).select("-password").populate("role").populate("assignedProject", "tender_id tender_project_name site_location");
  }

  static async updateEmployee(employeeId, updateData) {
    return await EmployeeModel.findOneAndUpdate(
      { employeeId, isDeleted: { $ne: true } },
      { $set: updateData },
      { new: true }
    ).select("-password");
  }

  static async deleteEmployee(employeeId) {
    const employee = await EmployeeModel.findOneAndUpdate(
      { employeeId, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, status: "Inactive" } },
      { new: true }
    );
    if (!employee) throw new Error("Employee record not found or has already been deactivated. Please verify the employee ID");
    return employee;
  }

  // --- 5. Pagination & Search ---
  static async getEmployeesPaginated(page, limit, search) {
    const query = { isDeleted: { $ne: true } };
    if (search) {
      // Escape special regex characters to prevent ReDoS attacks
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { employeeId: { $regex: safeSearch, $options: "i" } }
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
    return await EmployeeModel.find({ role: { $ne: null }, isDeleted: { $ne: true } })
      .populate("role", "role_id roleName")
      .sort({ createdAt: -1 });
  }

  static async getUnassignedEmployees() {
    return await EmployeeModel.find({ role: null, isDeleted: { $ne: true } })
      .select("employeeId name email")
      .lean();
  }

  static async getAssignedEmployees() {
    return await EmployeeModel.find({ role: { $ne: null }, isDeleted: { $ne: true } })
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
      { employeeId, isDeleted: { $ne: true } },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate("role");

    if (!updatedEmployee) throw new Error("Employee record not found. Please verify the employee ID and try again");
    return updatedEmployee;
  }

  static async resetPassword(userId, oldPassword, newPassword) {
    // 1. Find user and explicitly select password (hidden by default)
    const employee = await EmployeeModel.findOne({ employeeId: userId }).select("+password");
    if (!employee) throw new Error("Employee record not found. Please verify your account details");

    // 2. Check if old password is correct
    const isMatch = await bcrypt.compare(oldPassword, employee.password);
    if (!isMatch) throw new Error("The current password you entered is incorrect. Please try again");

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
        throw new Error("One or more of the specified project or site IDs could not be found. Please verify and try again");
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
      throw new Error("Employee record not found. Please verify the employee ID and try again");
    }

    // Notify employee about project assignment
    if (projectIds.length > 0) {
      const projectNames = updatedEmployee.assignedProject
        ?.map((p) => p.tender_project_name)
        .join(", ");
      NotificationService.notify({
        title: "Projects Assigned",
        message: `You have been assigned to: ${projectNames || "new projects"}`,
        audienceType: "user",
        users: [updatedEmployee._id],
        category: "task",
        priority: "medium",
        module: "project",
        actionUrl: `/dashboard/profile`,
        actionLabel: "View Profile",
      });
    }

    return updatedEmployee;
  }

  static async forgotPassword(email) {
    // 1. Check if user exists
    const employee = await EmployeeModel.findOne({ email });

    if (!employee) {
      throw new Error("No account found with this email address. Please verify and try again.");
    }

    if (employee.role === null) {
      throw new Error("This account does not have system access. Please contact the HR administrator to request access.");
    }

    if (employee.status !== "Active") {
      throw new Error("This account is currently inactive. Please contact the HR administrator for assistance.");
    }

    // 2. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Set Expiration (5 Minutes from now)
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000);

    // 4. Hash OTP before storing (prevents plaintext exposure if DB is compromised)
    employee.resetOTP = await bcrypt.hash(otp, 10);
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

    // 3. Check if OTP matches (compare against bcrypt hash)
    const isOTPValid = await bcrypt.compare(otp, employee.resetOTP);
    if (!isOTPValid) {
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