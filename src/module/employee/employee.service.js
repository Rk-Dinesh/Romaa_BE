import IdcodeServices from "../idcode/idcode.service.js";
import EmployeeModel from './employee.model.js'


class EmployeeService {
  // Create Employee
  static async addEmployee(employeeData) {
    const idname = "EMPLOYEE";
    const idcode = "EMP";
    await IdcodeServices.addIdCode(idname, idcode);
    const employee_id = await IdcodeServices.generateCode(idname); // Generates unique code
    if (!employee_id) throw new Error("Failed to generate employee ID");

    const employee = new EmployeeModel({
      employee_id,
      ...employeeData,
    });
    return await employee.save();
  }

  // Get all employees
  static async getAllEmployees() {
    return await EmployeeModel.find();
  }

  // Get employee by ID
  static async getEmployeeById(employee_id) {
    return await EmployeeModel.findOne({ employee_id });
  }

  // Get active employees
  static async getActiveEmployees() {
    return await EmployeeModel.find({ status: "ACTIVE" });
  }

  // Update employee
  static async updateEmployee(employee_id, updateData) {
    return await EmployeeModel.findOneAndUpdate(
      { employee_id },
      { $set: updateData },
      { new: true }
    );
  }

  // Delete employee
  static async deleteEmployee(employee_id) {
    return await EmployeeModel.findOneAndDelete({ employee_id });
  }

  // Search employees (by name, email, phone, site)
  static async searchEmployees(keyword) {
    return await EmployeeModel.find({
      $or: [
        { name: { $regex: keyword, $options: "i" } },
        { contact_email: { $regex: keyword, $options: "i" } },
        { contact_phone: { $regex: keyword, $options: "i" } },
        { site_assigned: { $regex: keyword, $options: "i" } },
      ]
    });
  }

  // 📌 Paginated, Search, Date filter
  static async getEmployeesPaginated(page, limit, search, fromdate, todate) {
    const query = {};

    // Keyword Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { contact_email: { $regex: search, $options: "i" } },
        { contact_phone: { $regex: search, $options: "i" } },
        { site_assigned: { $regex: search, $options: "i" } },
      ];
    }

    // Date Filtering (by createdAt)
    if (fromdate || todate) {
      query.createdAt = {};
      if (fromdate) query.createdAt.$gte = new Date(fromdate);
      if (todate) {
        const endOfDay = new Date(todate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        query.createdAt.$lte = endOfDay;
      }
    }

    const total = await EmployeeModel.countDocuments(query);
    const employees = await EmployeeModel.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return { total, employees };
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
