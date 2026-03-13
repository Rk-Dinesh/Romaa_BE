import WorkDoneService from "./workdone.service.js";

export const createReport = async (req, res) => {
  try {
    const report = await WorkDoneService.createReport(req.body);
    res.status(201).json({ status: true, message: "Work done report created", data: report });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getReportsByTender = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const { from, to } = req.query;
    const reports = await WorkDoneService.getReportsByTender(tender_id, { from, to });
    res.status(200).json({ status: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await WorkDoneService.getReportById(id);
    res.status(200).json({ status: true, data: report });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await WorkDoneService.updateReport(id, req.body);
    res.status(200).json({ status: true, message: "Report updated", data: report });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ status: false, message: "status is required" });
    const report = await WorkDoneService.updateStatus(id, status);
    res.status(200).json({ status: true, message: `Report status updated to ${status}`, data: report });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getReportsByDate = async (req, res) => {
  try {
    const { tender_id, report_date } = req.params;
    const reports = await WorkDoneService.getReportsByDate(tender_id, report_date);
    res.status(200).json({ status: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    await WorkDoneService.deleteReport(id);
    res.status(200).json({ status: true, message: "Report deleted" });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};
