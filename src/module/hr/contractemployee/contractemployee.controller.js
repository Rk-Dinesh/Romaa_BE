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

export const getAllEmployeeNameId = async (req, res) => {
  try {
    const clients = await ContractWorkerService.getAllEmployeeIDNAME();
    res.status(200).json({ status: true, data: clients });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get worker by ID
export const getWorkerById = async (req, res) => {
  try {
    const data = await ContractWorkerService.getWorkerById(req.params.worker_id);
    if (!data) return res.status(404).json({ status: false, message: "Worker not found" });
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

// Search
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
    const data = await ContractWorkerService.updateWorker(req.params.worker_id, req.body);
    if (!data) return res.status(404).json({ status: false, message: "Worker not found" });
    res.status(200).json({ status: true, message: "Worker updated", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Delete worker
export const deleteWorker = async (req, res) => {
  try {
    const data = await ContractWorkerService.deleteWorker(req.params.worker_id);
    if (!data) return res.status(404).json({ status: false, message: "Worker not found" });
    res.status(200).json({ status: true, message: "Worker deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Mark attendance
export const markAttendance = async (req, res) => {
  try {
    const { worker_id } = req.params;
    const { date, present, remarks } = req.body;
    const result = await ContractWorkerService.markAttendance(worker_id, new Date(date), present, remarks);
    res.status(200).json({ status: true, message: "Attendance marked", result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update attendance
export const updateAttendance = async (req, res) => {
  try {
    const { worker_id } = req.params;
    const { date, present, remarks } = req.body;
    const result = await ContractWorkerService.updateAttendance(worker_id, new Date(date), present, remarks);
    res.status(200).json({ status: true, message: "Attendance updated", result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get attendance range
export const getAttendance = async (req, res) => {
  try {
    const { worker_id } = req.params;
    const { startDate, endDate } = req.query;
    const data = await ContractWorkerService.getAttendance(worker_id, startDate, endDate);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

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
