import dotenv from "dotenv";
dotenv.config();
import EmployeeService from "./employee.service.js";
import EmployeeModel from "./employee.model.js";

// --- AUTHENTICATION ---

// 1. Login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: false, message: "Email and password are required" });
    }

    const { user, accessToken, refreshToken } = await EmployeeService.loginUser(email, password);

    // Secure Cookie Options
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Only secure in prod
      sameSite: "strict"
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json({
        status: true,
        message: "User logged in successfully",
        data: { user } 
      });

  } catch (error) {
    return res.status(401).json({ status: false, message: error.message });
  }
};

export const mobileLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: false, message: "Email and password are required" });
    }

    const { user, accessToken, refreshToken } = await EmployeeService.loginUser(email, password);

    // 1. Set Cookies (Great for Web)
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json({
        status: true,
        message: "User logged in successfully",
        data: { 
          user,
          accessToken, 
          refreshToken 
        } 
      });

  } catch (error) {
    return res.status(401).json({ status: false, message: error.message });
  }
};

// --- EMPLOYEE MANAGEMENT ---

// 2. Create Employee (Register)
export const createEmployee = async (req, res) => {
  try {
    const data = await EmployeeService.addEmployee(req.body);
    res.status(201).json({ status: true, message: "Employee created successfully", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 3. Get All Employees (Paginated)
export const getAllEmployees = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const data = await EmployeeService.getEmployeesPaginated(page, limit, search);

    res.status(200).json({
      status: true,
      message: "Employees fetched",
      data: data.employees,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(data.total / limit),
        totalRecords: data.total
      }
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 4. Get Single Employee
export const getEmployeeById = async (req, res) => {
  try {
    const data = await EmployeeService.getEmployeeById(req.params.employeeId);
    if (!data) return res.status(404).json({ status: false, message: "Employee not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 5. Update Employee
export const updateEmployee = async (req, res) => {
  try {
    const data = await EmployeeService.updateEmployee(req.params.employeeId, req.body);
    if (!data) return res.status(404).json({ status: false, message: "Employee not found" });
    res.status(200).json({ status: true, message: "Employee updated", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 6. Delete Employee
export const deleteEmployee = async (req, res) => {
  try {
    const data = await EmployeeService.deleteEmployee(req.params.employeeId);
    if (!data) return res.status(404).json({ status: false, message: "Employee not found" });
    res.status(200).json({ status: true, message: "Employee deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// --- ROLE MANAGEMENT ---

// 7. Assign Role
export const assignRole = async (req, res) => {
  try {
    const { employeeId, roleId,accessMode } = req.body;
    if (!employeeId) {
      return res.status(400).json({ status: false, message: "Employee ID is required" });
    }
    
    const data = await EmployeeService.assignRoleToUser(employeeId, roleId,accessMode);
    res.status(200).json({ status: true, message: "Role assigned successfully", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 8. Get Users by Role (e.g. for Dropdowns)
export const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.query; // ?role=SITE_ENGINEER
    if (!role) return res.status(400).json({ status: false, message: "Role name is required" });

    const data = await EmployeeService.getUsersByRole(role);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 9. Logout
export const logout = (req, res) => {
  try {
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    };

    // 1. Clear the cookies by setting them to empty/expired
    res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json({ status: true, message: "User logged out successfully" });

  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getEmployeesWithRoles = async (req, res) => {
  try {
    const employees = await EmployeeService.getEmployeesWithRoles();
    res.status(200).json({
      status: true,
      message: "Fetched employees with assigned roles",
      data: employees,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getUnassignedEmployees = async (req, res) => {
  try {
    const employees = await EmployeeService.getUnassignedEmployees();
    res.status(200).json({
      status: true,
      message: "Fetched unassigned employees",
      data: employees,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAssignedEmployees = async (req, res) => {
  try {
    const employees = await EmployeeService.getAssignedEmployees();
    res.status(200).json({
      status: true,
      message: "Fetched assigned employees",
      data: employees,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateEmployeeAccess = async (req, res) => {
  try {
    const { employeeId } = req.params;
    // Extract only allowed fields to prevent overwriting sensitive data
    const { role, assignedSite, status,password,accessMode } = req.body;

    const updatedData = await EmployeeService.updateEmployeeAccess(employeeId, {
      role,
      assignedSite,
      status,
      password,
      accessMode
    });

    res.status(200).json({
      status: true,
      message: "Employee access updated successfully",
      data: updatedData,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    // Assuming the user is logged in, we get ID from req.user (Middleware)
    // OR if an admin is resetting it, we get ID from req.body/params.
    // Here assuming the user is resetting THEIR OWN password:
    const userId = req.user.employeeId; 
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ status: false, message: "Both old and new passwords are required" });
    }

    await EmployeeService.resetPassword(userId, oldPassword, newPassword);

    res.status(200).json({
      status: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};


export const assignProjects = async (req, res) => {
  try {
    const { employeeId, assignedProject } = req.body;

    // Basic Validation
    if (!employeeId) {
      return res.status(400).json({ 
        status: false, 
        message: "Employee ID is required" 
      });
    }

    if (!Array.isArray(assignedProject)) {
      return res.status(400).json({ 
        status: false, 
        message: "assignedProject must be an array of IDs" 
      });
    }

    // Call Service
    const updatedEmployee = await EmployeeService.assignProjectsToUser(
      employeeId, 
      assignedProject
    );

    return res.status(200).json({
      status: true,
      message: "Projects assigned successfully",
      data: updatedEmployee,
    });

  } catch (error) {
    console.error("Error assigning projects:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        status: false, 
        message: "Email is required" 
      });
    }

    const user = await EmployeeModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        status: false, 
        message: "User not found" 
      });
    }

    const result = await EmployeeService.forgotPassword(email);

    return res.status(200).json({
      status: true,
      message: result.message,
    });

  } catch (error) {
    console.error("Forgot Password Error:", error);
    
    // Security Best Practice: Don't always reveal if a user exists or not explicitly 
    // to prevent enumeration, but for internal tools, error messages are okay.
    return res.status(400).json({
      status: false,
      message: error.message || "Something went wrong",
    });
  }
};

export const resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Basic Validation
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ 
        status: false, 
        message: "Email, OTP, and New Password are required." 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        status: false, 
        message: "Password must be at least 6 characters long." 
      });
    }

    // Call Service
    const result = await EmployeeService.verifyOTPAndResetPassword(email, otp, newPassword);

    return res.status(200).json({
      status: true,
      message: result.message,
    });

  } catch (error) {
    console.error("Reset Password Error:", error);
    
    // Return specific error messages (Invalid OTP, Expired, etc.)
    return res.status(400).json({
      status: false,
      message: error.message || "Failed to reset password",
    });
  }
};