import ContractWorkerService from "./contractworker.service.js";

// Add workers to tender
export const addContractWorkers = async (req, res) => {
  try {
    const { tender_id, workers } = req.body;
    const result = await ContractWorkerService.addContractWorkers(tender_id, workers);
    res.status(201).json({ status: true, message: "Permitted contractors added to the tender successfully.", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get workers for a tender (populated)
export const getContractWorkers = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const result = await ContractWorkerService.getContractWorkersByTender(tender_id);
    if (!result) return res.status(404).json({ status: false, message: "No permitted contractors found for this tender. Please add contractors before viewing." });
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update a worker
export const updateContractWorker = async (req, res) => {
  try {
    const { tender_id, worker_id } = req.params;
    const result = await ContractWorkerService.updateContractWorker(tender_id, worker_id, req.body);
    res.status(200).json({ status: true, message: "Permitted contractor details updated successfully.", data: result });
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({ status: false, message: error.message });
  }
};

// Remove worker
export const removeContractWorker = async (req, res) => {
  try {
    const { tender_id, worker_id } = req.params;
    const result = await ContractWorkerService.removeContractWorker(tender_id, worker_id);
    res.status(200).json({ status: true, message: "Contract worker removed from the tender successfully.", data: result });
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({ status: false, message: error.message });
  }
};
export const removePermittedContractor = async (req, res) => {
  try {
    const { tender_id, contractWorker_id } = req.params;
    const result = await ContractWorkerService.removePermittedContractor(tender_id, contractWorker_id);
    res.status(200).json({ status: true, message: "Permitted contractor removed from the tender successfully.", data: result });
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({ status: false, message: error.message });
  }
};
export const getpaginatedContractor = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const { page = 1, limit = 10, search = "" } = req.query;

    const result = await ContractWorkerService.getcontractorPaginated(
      tender_id,
      parseInt(page),
      parseInt(limit),
      search
    );

    res.status(200).json({
      status: true,
      total: result.total,
      data: result.contractors,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: "Unable to retrieve permitted contractors. Please try again later." });
  }
};
