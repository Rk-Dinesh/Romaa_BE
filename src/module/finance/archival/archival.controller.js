import ArchivalService from "./archival.service.js";

export const startArchival = async (req, res) => {
  try {
    const { fin_year } = req.body;
    if (!fin_year) {
      return res.status(400).json({ status: false, message: "fin_year is required (e.g. '24-25')" });
    }
    const result = await ArchivalService.archiveFY(fin_year, req.user?._id);
    res.status(202).json({ status: true, ...result }); // 202 Accepted — async operation
  } catch (err) {
    const code = err.message.includes("already") ? 409 : 500;
    res.status(code).json({ status: false, message: err.message });
  }
};

export const getArchivalStatus = async (req, res) => {
  try {
    const { fin_year } = req.params;
    const job = await ArchivalService.getJobStatus(fin_year);
    if (!job) {
      return res.status(404).json({ status: false, message: `No archival job found for FY ${fin_year}` });
    }
    res.status(200).json({ status: true, data: job });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const listArchivalJobs = async (req, res) => {
  try {
    const jobs = await ArchivalService.listJobs();
    res.status(200).json({ status: true, count: jobs.length, data: jobs });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
