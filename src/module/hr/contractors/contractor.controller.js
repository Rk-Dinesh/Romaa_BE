import ContractorService from "./contractor.service.js";

// Create contractor
export const createContractor = async (req, res) => {
  try {
    const data = await ContractorService.addContractor(req.body);
    res.status(201).json({ status: true, message: "Contractor created", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get all contractors
export const getAllContractors = async (req, res) => {
  try {
    const data = await ContractorService.getAllContractors();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Dropdown select
export const getAllContractorsSelect = async (req, res) => {
  try {
    const data = await ContractorService.getAllContractorsSelect();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllContractorsSelectbyProject = async (req, res) => {
  try {
    const data = await ContractorService.getAllContractorsSelectbyProject(req.params.tender_id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getContractorsByTenderId = async (req, res) => {
  try {
    const data = await ContractorService.getContractorsByTenderId(req.params.tender_id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get contractor by ID
export const getContractorById = async (req, res) => {
  try {
    const data = await ContractorService.getContractorById(
      req.params.contractor_id
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get active contractors
export const getActiveContractors = async (req, res) => {
  try {
    const data = await ContractorService.getActiveContractors();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update contractor
export const updateContractor = async (req, res) => {
  try {
    const data = await ContractorService.updateContractor(
      req.params.contractor_id,
      req.body
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res
      .status(200)
      .json({ status: true, message: "Contractor updated", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Soft delete contractor
export const deleteContractor = async (req, res) => {
  try {
    const data = await ContractorService.deleteContractor(
      req.params.contractor_id
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, message: "Contractor deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Search contractors
export const searchContractors = async (req, res) => {
  try {
    const data = await ContractorService.searchContractors(req.query.q || "");
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Paginated contractor list
export const getContractorsPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fromdate = req.query.fromdate || null;
    const todate = req.query.todate || null;

    const data = await ContractorService.getContractorsPaginated(
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
      data: data.contractors,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// =============================================
// NEW APIs
// =============================================

// Get contractor with all employees
export const getContractorWithEmployees = async (req, res) => {
  try {
    const data = await ContractorService.getContractorWithEmployees(
      req.params.contractor_id
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getContractorWithEmployeesbyProject = async (req, res) => {
  try {
    const data = await ContractorService.getContractorWithEmployeesbyProject(
      req.params.contractor_id,
      req.params.tender_id
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Paginated employees under a contractor
export const getContractorEmployeesPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const data = await ContractorService.getContractorEmployeesPaginated(
      req.params.contractor_id,
      page,
      limit,
      search
    );

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalRecords: data.total,
      data: data.employees,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Assign project to contractor
export const assignProject = async (req, res) => {
  try {
    const data = await ContractorService.assignProject(
      req.params.contractor_id,
      req.body
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, message: "Project assigned", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Remove project assignment
export const removeProject = async (req, res) => {
  try {
    const data = await ContractorService.removeProject(
      req.params.contractor_id,
      req.params.tender_id
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, message: "Project withdrawn", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get assigned projects
export const getAssignedProjects = async (req, res) => {
  try {
    const data = await ContractorService.getAssignedProjects(
      req.params.contractor_id
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update account details
export const updateAccountDetails = async (req, res) => {
  try {
    const data = await ContractorService.updateAccountDetails(
      req.params.contractor_id,
      req.body
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Contractor not found" });
    res
      .status(200)
      .json({ status: true, message: "Account details updated", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Dashboard stats
export const getDashboardStats = async (req, res) => {
  try {
    const data = await ContractorService.getDashboardStats();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
