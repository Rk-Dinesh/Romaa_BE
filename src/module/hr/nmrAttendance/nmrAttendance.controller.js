import NMRAttendanceService from "./nmrAttendance.service.js";

export const createAttendance = async (req, res) => {
  try {
    const record = await NMRAttendanceService.createAttendance(req.body);
    res.status(201).json({ status: true, message: "NMR attendance recorded successfully", data: record });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const createFromDLP = async (req, res) => {
  try {
    const { dlr_id } = req.params;
    const { verified_by } = req.body;
    const record = await NMRAttendanceService.createFromDLP(dlr_id, { verified_by });
    res.status(201).json({ status: true, message: "NMR attendance created from Daily Labour Report successfully", data: record });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getByProject = async (req, res) => {
  try {
    const { project_id } = req.params;
    const { contractor_id, page, limit, search } = req.query;
    const fromdate = req.query.fromdate || req.query.from;
    const todate   = req.query.todate   || req.query.to;
    const result = await NMRAttendanceService.getByProject(project_id, { fromdate, todate, contractor_id, page, limit, search });
    res.status(200).json({
      status: true,
      currentPage: result.page,
      totalPages: Math.ceil(result.total / result.limit),
      totalCount: result.total,
      data: result.data,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await NMRAttendanceService.getById(id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const getWorkerHistory = async (req, res) => {
  try {
    const { project_id, worker_id } = req.params;
    const { from, to } = req.query;
    const data = await NMRAttendanceService.getWorkerHistory(project_id, worker_id, { from, to });
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getSummary = async (req, res) => {
  try {
    const { project_id } = req.params;
    const { from, to, contractor_id } = req.query;
    const data = await NMRAttendanceService.getSummary(project_id, { from, to, contractor_id });
    res.status(200).json({ status: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await NMRAttendanceService.updateAttendance(id, req.body);
    res.status(200).json({ status: true, message: "NMR attendance updated successfully", data: record });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const approveAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified_by } = req.body;
    const record = await NMRAttendanceService.approveAttendance(id, verified_by);
    res.status(200).json({ status: true, message: "NMR attendance approved successfully", data: record });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};
