import EmployeeModel from "./employee.model.js";
import logger from "../../config/logger.js";

class EmployeeService {
  static async addEmployee(employeeDetails) {
    try {
      const newEmployee = new EmployeeModel(employeeDetails);
      return await newEmployee.save();
    } catch (error) {
      logger.error("Error while adding an employee: " + error);
      throw error;
    }
  }

  static async getEmployeeById(employeeId) {
    try {
      return await EmployeeModel.findOne({ employee_id: employeeId });
    } catch (error) {
      logger.error("Error while getting employee by id: " + error);
      throw error;
    }
  }

  static async getAllEmployees() {
    try {
      return await EmployeeModel.find();
    } catch (error) {
      logger.error("Error while getting all employees: " + error);
      throw error;
    }
  }

  static async updateEmployeeById(employee_id, updatedData) {
    try {
      return await EmployeeModel.findOneAndUpdate(
        { employee_id },
        { $set: updatedData },
        { new: true }
      );
    } catch (error) {
      logger.error("Error while updating employee: " + error);
      throw error;
    }
  }

  static async deleteEmployeeById(employee_id) {
    try {
      return await EmployeeModel.findOneAndDelete({ employee_id });
    } catch (error) {
      logger.error("Error while deleting employee: " + error);
      throw error;
    }
  }
}

export default EmployeeService;
