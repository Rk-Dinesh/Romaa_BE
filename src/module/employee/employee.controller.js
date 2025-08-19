import EmployeeService from "./employee.service.js";

// Create Employee
export const createEmployee = async (req, res) => {
  try {
    const data = await EmployeeService.addEmployee(req.body);
    res.status(201).json({ status: true, message: "Employee created", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get All Employees
export const getAllEmployees = async (req, res) => {
  try {
    const data = await EmployeeService.getAllEmployees();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get Employee by ID
export const getEmployeeById = async (req, res) => {
  try {
    const data = await EmployeeService.getEmployeeById(req.params.employee_id);
    if (!data) return res.status(404).json({ status: false, message: "Employee not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get Active Employees
export const getActiveEmployees = async (req, res) => {
  try {
    const data = await EmployeeService.getActiveEmployees();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update Employee
export const updateEmployee = async (req, res) => {
  try {
    const data = await EmployeeService.updateEmployee(req.params.employee_id, req.body);
    if (!data) return res.status(404).json({ status: false, message: "Employee not found" });
    res.status(200).json({ status: true, message: "Employee updated", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Delete Employee
export const deleteEmployee = async (req, res) => {
  try {
    const data = await EmployeeService.deleteEmployee(req.params.employee_id);
    if (!data) return res.status(404).json({ status: false, message: "Employee not found" });
    res.status(200).json({ status: true, message: "Employee deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Search Employees
export const searchEmployees = async (req, res) => {
  try {
    const data = await EmployeeService.searchEmployees(req.query.q || "");
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 📌 Get paginated employees with search + date filter
export const getEmployeesPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fromdate = req.query.fromdate || null;
    const todate = req.query.todate || null;

    const data = await EmployeeService.getEmployeesPaginated(
      page,
      limit,
      search,
      fromdate,
      todate
    );

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalRecords: data.total,
      data: data.employees
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 📅 Attendance APIs
export const markAttendance = async (req, res) => {
  try {
    const { date, present, remarks } = req.body;
    const result = await EmployeeService.markAttendance(
      req.params.employee_id,
      new Date(date),
      present,
      remarks
    );
    res.status(200).json({ status: true, message: "Attendance marked", result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const { date, present, remarks } = req.body;
    const result = await EmployeeService.updateAttendance(
      req.params.employee_id,
      new Date(date),
      present,
      remarks
    );
    res.status(200).json({ status: true, message: "Attendance updated", result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAttendance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await EmployeeService.getAttendance(
      req.params.employee_id,
      startDate,
      endDate
    );
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

