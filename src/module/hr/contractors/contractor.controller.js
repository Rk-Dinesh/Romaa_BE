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

// Get contractor by ID
export const getContractorById = async (req, res) => {
  try {
    const data = await ContractorService.getContractorById(req.params.contractor_id);
    if (!data) return res.status(404).json({ status: false, message: "Contractor not found" });
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
    const data = await ContractorService.updateContractor(req.params.contractor_id, req.body);
    if (!data) return res.status(404).json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, message: "Contractor updated", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Delete contractor
export const deleteContractor = async (req, res) => {
  try {
    const data = await ContractorService.deleteContractor(req.params.contractor_id);
    if (!data) return res.status(404).json({ status: false, message: "Contractor not found" });
    res.status(200).json({ status: true, message: "Contractor deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Search contractor
export const searchContractors = async (req, res) => {
  try {
    const data = await ContractorService.searchContractors(req.query.q || "");
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Paginated contractor list with filters
export const getContractorsPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fromdate = req.query.fromdate || null;
    const todate = req.query.todate || null;

    const data = await ContractorService.getContractorsPaginated(page, limit, search, fromdate, todate);

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalRecords: data.total,
      data: data.contractors
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
