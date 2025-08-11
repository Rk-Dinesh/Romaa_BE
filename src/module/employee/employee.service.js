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

  static async markAttendance(employee_id, date, present, remarks = "") {
    return await EmployeeModel.updateOne(
      { employee_id, "daily_attendance.date": { $ne: date } },
      { $push: { daily_attendance: { date, present, remarks } } }
    );
  }

  // 📌 Update existing attendance
  static async updateAttendance(employee_id, date, present, remarks = "") {
    return await EmployeeModel.updateOne(
      { employee_id, "daily_attendance.date": date },
      {
        $set: {
          "daily_attendance.$.present": present,
          "daily_attendance.$.remarks": remarks
        }
      }
    );
  }

  // 📌 Get attendance for date range
  static async getAttendance(employee_id, startDate, endDate) {
    const emp = await EmployeeModel.findOne(
      { employee_id },
      { daily_attendance: 1, _id: 0 }
    );

    if (!emp) return null;

    return emp.daily_attendance.filter(
      (att) =>
        att.date >= new Date(startDate) && att.date <= new Date(endDate)
    );
  }
}

export default EmployeeService;
