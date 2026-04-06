import DLPService from "./dlp.service.js";

export const bulkCreateReports = async (req, res) => {
  try {
    const reports = Array.isArray(req.body) ? req.body : req.body.reports;
    const result = await DLPService.bulkCreateReports(reports);
    res.status(201).json({ status: true, message: "Daily Labour Reports submitted successfully", count: result.length, data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const createReport = async (req, res) => {
  try {
    const report = await DLPService.createReport(req.body);
    res.status(201).json({ status: true, message: "Daily Labour Report submitted successfully", data: report });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getReportsByProject = async (req, res) => {
  try {
    const { project_id } = req.params;
    const { from, to } = req.query;
    const reports = await DLPService.getReportsByProject(project_id, { from, to });
    res.status(200).json({ status: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getReportsByContractor = async (req, res) => {
  try {
    const { project_id, contractor_id } = req.params;
    const { from, to } = req.query;
    const reports = await DLPService.getReportsByContractor(project_id, contractor_id, { from, to });
    res.status(200).json({ status: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await DLPService.getReportById(id);
    res.status(200).json({ status: true, data: report });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await DLPService.updateReport(id, req.body);
    res.status(200).json({ status: true, message: "Report updated", data: report });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;
    if (!status) {
      return res.status(400).json({ status: false, message: "status is required" });
    }
    const report = await DLPService.updateStatus(id, status, remark);
    res.status(200).json({ status: true, message: `Report ${status.toLowerCase()}`, data: report });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getSummaryByDate = async (req, res) => {
  try {
    const { project_id } = req.params;
    const summary = await DLPService.getSummaryByDate(project_id);
    res.status(200).json({ status: true, count: summary.length, data: summary });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getReportsByDate = async (req, res) => {
  try {
    const { project_id, report_date } = req.params;
    const reports = await DLPService.getReportsByDate(project_id, report_date);
    res.status(200).json({ status: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    await DLPService.deleteReport(id);
    res.status(200).json({ status: true, message: "Report deleted" });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};
