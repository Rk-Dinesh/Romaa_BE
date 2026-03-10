import ContractWorkerService from "./contractemployee.service.js";

// Create worker
export const createWorker = async (req, res) => {
  try {
    const data = await ContractWorkerService.addWorker(req.body);
    res.status(201).json({ status: true, message: "Worker created", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get all workers
export const getAllWorkers = async (req, res) => {
  try {
    const data = await ContractWorkerService.getAllWorkers();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Dropdown (id + name)
export const getAllEmployeeNameId = async (req, res) => {
  try {
    const data = await ContractWorkerService.getAllEmployeeIDNAME();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get worker by ID
export const getWorkerById = async (req, res) => {
  try {
    const data = await ContractWorkerService.getWorkerById(
      req.params.worker_id
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Worker not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get active workers
export const getActiveWorkers = async (req, res) => {
  try {
    const data = await ContractWorkerService.getActiveWorkers();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Search workers
export const searchWorkers = async (req, res) => {
  try {
    const data = await ContractWorkerService.searchWorkers(req.query.q || "");
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update worker
export const updateWorker = async (req, res) => {
  try {
    const data = await ContractWorkerService.updateWorker(
      req.params.worker_id,
      req.body
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Worker not found" });
    res.status(200).json({ status: true, message: "Worker updated", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Soft delete worker
export const deleteWorker = async (req, res) => {
  try {
    const data = await ContractWorkerService.deleteWorker(
      req.params.worker_id
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Worker not found" });
    res.status(200).json({ status: true, message: "Worker deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Paginated workers list
export const getContractWorkersPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fromdate = req.query.fromdate || null;
    const todate = req.query.todate || null;

    const data = await ContractWorkerService.getContractWorkersPaginated(
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
      data: data.contractWorkers,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// =============================================
// NEW APIs
// =============================================

// Get all workers by contractor
export const getWorkersByContractor = async (req, res) => {
  try {
    const data = await ContractWorkerService.getWorkersByContractor(
      req.params.contractor_id
    );
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Transfer worker to different contractor
export const transferWorker = async (req, res) => {
  try {
    const { new_contractor_id } = req.body;
    if (!new_contractor_id)
      return res
        .status(400)
        .json({ status: false, message: "new_contractor_id is required" });

    const data = await ContractWorkerService.transferWorker(
      req.params.worker_id,
      new_contractor_id
    );
    res
      .status(200)
      .json({ status: true, message: "Worker transferred", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Assign/change site
export const assignSite = async (req, res) => {
  try {
    const { site_assigned } = req.body;
    if (!site_assigned)
      return res
        .status(400)
        .json({ status: false, message: "site_assigned is required" });

    const data = await ContractWorkerService.assignSite(
      req.params.worker_id,
      site_assigned
    );
    if (!data)
      return res
        .status(404)
        .json({ status: false, message: "Worker not found" });
    res.status(200).json({ status: true, message: "Site assigned", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
