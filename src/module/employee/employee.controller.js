import logger from "../../config/logger.js";
import IdcodeServices from "../idcode/idcode.service.js";
import EmployeeService from "./employee.service.js";

export const createEmployee = async (req, res) => {
  try {
    const {
      name,
      role,
      site_assigned,
      status,
      contact_phone,
      contact_email,
      address,
      date_of_joining,
      emergency_contact,
      id_proof_type,
      id_proof_number,
      created_by_user,
    } = req.body;

    const idname = "Employee";
    const idcode = "EMP";
    await IdcodeServices.addIdCode(idname, idcode);
    const employee_id = await IdcodeServices.generateCode(idname);
    if (!employee_id) {
      throw new Error("Failed to generate employee ID.");
    }

    const employeeData = {
      employee_id,
      name,
      role,
      site_assigned,
      status,
      contact_phone,
      contact_email,
      address,
      date_of_joining,
      emergency_contact,
      id_proof_type,
      id_proof_number,
      created_by_user,
    };

    const result = await EmployeeService.addEmployee(employeeData);

    res.status(200).json({
      status: true,
      message: "Employee created successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`Error creating employee: ${error.message}`);
    res.status(500).json({
      status: false,
      message: "Error creating employee",
      error: error.message,
    });
  }
};

export const getEmployeeById = async (req, res) => {
  const { employee_id } = req.query;
  try {
    const employee = await EmployeeService.getEmployeeById(employee_id);
    res.status(200).json({
      status: true,
      message: "Employee fetched successfully",
      data: employee,
    });
  } catch (error) {
    logger.error(`Error while getting employee: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllEmployees = async (req, res) => {
  try {
    const employees = await EmployeeService.getAllEmployees();
    res.status(200).json({
      status: true,
      message: "All employees fetched successfully",
      data: employees,
    });
  } catch (error) {
    logger.error(`Error while getting all employees: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateEmployeeById = async (req, res) => {
  const { employee_id } = req.query;
  try {
    const update = req.body;
    const updated = await EmployeeService.updateEmployeeById(employee_id, update);
    res.status(200).json({
      status: true,
      message: "Employee updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error(`Error while updating employee: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteEmployeeById = async (req, res) => {
  const { employee_id } = req.query;
  try {
    const deleted = await EmployeeService.deleteEmployeeById(employee_id);
    res.status(200).json({
      status: true,
      message: "Employee deleted successfully",
      data: deleted,
    });
  } catch (error) {
    logger.error(`Error while deleting employee: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
  }
};
