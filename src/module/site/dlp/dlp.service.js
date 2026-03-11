import DLRModel from "./dlp.model.js";
import NMRAttendanceModel from "../../hr/nmrAttendance/nmrattendance.model.js";

class DLPService {
  // Create a new Daily Labour Report
  static async createReport(payload) {
    const report = new DLRModel({
      report_date: payload.report_date ? new Date(payload.report_date) : new Date(),
      project_id: payload.project_id,
      contractor_id: payload.contractor_id,
      work_entries: (payload.work_entries || []).map((e) => ({
        description: e.description,
        category: e.category,
        l: Number(e.l) || 0,
        b: Number(e.b) || 0,
        h: Number(e.h) || 0,
        quantity: Number(e.quantity) || 0,
        unit: e.unit || "CUM",
        worker_id: e.worker_id,
        worker_name: e.worker_name || "",
        status: e.status || "PRESENT",
        daily_wage: Number(e.daily_wage) || 0,
        remark: e.remark || "",
      })),
      remark: payload.remark || "",
      created_by: payload.created_by || "",
    });

    return await report.save();
  }

  // Bulk create multiple Daily Labour Reports in one request
  static async bulkCreateReports(reports) {
    if (!Array.isArray(reports) || reports.length === 0) {
      throw new Error("reports must be a non-empty array");
    }

    const docs = reports.map((payload) => ({
      report_date: payload.report_date ? new Date(payload.report_date) : new Date(),
      project_id: payload.project_id,
      contractor_id: payload.contractor_id,
      work_entries: (payload.work_entries || []).map((e) => ({
        description: e.description,
        category: e.category,
        l: Number(e.l) || 0,
        b: Number(e.b) || 0,
        h: Number(e.h) || 0,
        quantity: Number(e.quantity) || 0,
        unit: e.unit || "CUM",
        worker_id: e.worker_id,
        worker_name: e.worker_name || "",
        status: e.status || "PRESENT",
        daily_wage: Number(e.daily_wage) || 0,
        remark: e.remark || "",
      })),
      remark: payload.remark || "",
      created_by: payload.created_by || "",
    }));

    // insertMany skips pre-save middleware; use save() on each doc so totals are computed
    const saved = await Promise.all(
      docs.map((doc) => new DLRModel(doc).save())
    );

    // Auto-mark NMR attendance from each saved DLP report.
    // Skip silently if a record already exists for that project+contractor+date.
    await Promise.all(
      saved.map(async (dlr) => {
        const exists = await NMRAttendanceModel.findOne({
          project_id: dlr.project_id,
          contractor_id: dlr.contractor_id,
          attendance_date: dlr.report_date,
        });
        if (exists) return;

        const nmr = new NMRAttendanceModel({
          attendance_date: dlr.report_date,
          project_id: dlr.project_id,
          contractor_id: dlr.contractor_id,
          attendance_list: dlr.work_entries.map((e) => ({
            worker_id: e.worker_id,
            worker_name: e.worker_name || "",
            category: e.category || "",
            status: e.status || "PRESENT",
            in_time: "",
            out_time: "",
            daily_wage: e.daily_wage || 0,
          })),
        });
        await nmr.save();
      })
    );

    return saved;
  }

  // Get all reports for a project (list view, no entries)
  static async getReportsByProject(project_id, { from, to } = {}) {
    const filter = { project_id };
    if (from || to) {
      filter.report_date = {};
      if (from) filter.report_date.$gte = new Date(from);
      if (to) filter.report_date.$lte = new Date(to);
    }
    return await DLRModel.find(filter)
      .select("-work_entries")
      .sort({ report_date: -1 });
  }

  // Get all reports for a project + contractor
  static async getReportsByContractor(project_id, contractor_id, { from, to } = {}) {
    const filter = { project_id, contractor_id };
    if (from || to) {
      filter.report_date = {};
      if (from) filter.report_date.$gte = new Date(from);
      if (to) filter.report_date.$lte = new Date(to);
    }
    return await DLRModel.find(filter)
      .select("-work_entries")
      .sort({ report_date: -1 });
  }

  // Get a single report with full work_entries
  static async getReportById(id) {
    const report = await DLRModel.findById(id);
    if (!report) throw new Error("Daily Labour Report not found");
    return report;
  }

  // Replace work_entries on a PENDING report
  static async updateReport(id, payload) {
    const report = await DLRModel.findById(id);
    if (!report) throw new Error("Daily Labour Report not found");
    if (report.status !== "PENDING") {
      throw new Error("Only PENDING reports can be edited");
    }

    if (payload.work_entries !== undefined) {
      report.work_entries = payload.work_entries.map((e) => ({
        description: e.description,
        category: e.category,
        l: Number(e.l) || 0,
        b: Number(e.b) || 0,
        h: Number(e.h) || 0,
        quantity: Number(e.quantity) || 0,
        unit: e.unit || "CUM",
        worker_id: e.worker_id,
        worker_name: e.worker_name || "",
        status: e.status || "PRESENT",
        daily_wage: Number(e.daily_wage) || 0,
        remark: e.remark || "",
      }));
    }
    if (payload.remark !== undefined) report.remark = payload.remark;
    if (payload.report_date !== undefined) report.report_date = new Date(payload.report_date);

    return await report.save(); // triggers pre-save middleware for totals
  }

  // Approve or Reject a report
  static async updateStatus(id, status, remark) {
    const report = await DLRModel.findById(id);
    if (!report) throw new Error("Daily Labour Report not found");
    if (!["APPROVED", "REJECTED"].includes(status)) {
      throw new Error("Status must be APPROVED or REJECTED");
    }
    report.status = status;
    if (remark !== undefined) report.remark = remark;
    return await report.save();
  }

  // Delete a PENDING report
  static async deleteReport(id) {
    const report = await DLRModel.findById(id);
    if (!report) throw new Error("Daily Labour Report not found");
    if (report.status !== "PENDING") {
      throw new Error("Only PENDING reports can be deleted");
    }
    await DLRModel.findByIdAndDelete(id);
  }
}

export default DLPService;
