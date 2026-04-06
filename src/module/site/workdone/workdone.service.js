import WorkDoneModel from "./workdone.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

function mapWorkItems(items = []) {
  return items.map((item) => ({
    item_description: item.item_description,
    dimensions: {
      length: Number(item.dimensions?.length) || 0,
      breadth: Number(item.dimensions?.breadth) || 0,
      height: Number(item.dimensions?.height) || 0,
    },
    quantity: Number(item.quantity) || 0,
    unit: item.unit || "Nos",
    remarks: item.remarks || "No Remarks",
    contractor_details: item.contractor_details || "NMR",
  }));
}

class WorkDoneService {
  static async createReport(payload) {
    await IdcodeServices.addIdCode("WorkDone", "WKD");
    const workId = await IdcodeServices.generateCode("WorkDone");

    const totalWorkDone = (payload.dailyWorkDone || []).reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    );

    const report = new WorkDoneModel({
      workId,
      tender_id: payload.tender_id,
      report_date: payload.report_date ? new Date(payload.report_date) : new Date(),
      dailyWorkDone: mapWorkItems(payload.dailyWorkDone),
      totalWorkDone,
      created_by: payload.created_by || "Site Engineer",
      status: payload.status || "Submitted",
    });

    return await report.save();
  }

  static async getReportsByTender(tender_id, { from, to } = {}) {
    const filter = { tender_id };
    if (from || to) {
      filter.report_date = {};
      if (from) filter.report_date.$gte = new Date(from);
      if (to) filter.report_date.$lte = new Date(to);
    }
    return await WorkDoneModel.find(filter)
      .select("-dailyWorkDone")
      .sort({ report_date: -1 });
  }

  static async getReportById(id) {
    const report = await WorkDoneModel.findById(id);
    if (!report) throw new Error("Site work completion report not found. Please verify the report ID and try again");
    return report;
  }

  static async updateReport(id, payload) {
    const report = await WorkDoneModel.findById(id);
    if (!report) throw new Error("Site work completion report not found. Please verify the report ID and try again");
    if (report.status === "Approved") {
      throw new Error("Approved reports cannot be modified. Please contact the project manager for corrections");
    }

    if (payload.dailyWorkDone !== undefined) {
      report.dailyWorkDone = mapWorkItems(payload.dailyWorkDone);
      report.totalWorkDone = report.dailyWorkDone.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0
      );
    }
    if (payload.report_date !== undefined) report.report_date = new Date(payload.report_date);
    if (payload.created_by !== undefined) report.created_by = payload.created_by;

    return await report.save();
  }

  static async updateStatus(id, status) {
    const report = await WorkDoneModel.findById(id);
    if (!report) throw new Error("Site work completion report not found. Please verify the report ID and try again");
    if (!["Draft", "Submitted", "Approved", "Rejected"].includes(status)) {
      throw new Error("Invalid report status. Accepted values are: PENDING, APPROVED, REJECTED");
    }
    report.status = status;
    return await report.save();
  }

  static async getReportsByDate(tender_id, report_date) {
    const start = new Date(report_date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(report_date);
    end.setUTCHours(23, 59, 59, 999);

    const reports = await WorkDoneModel.find({
      tender_id,
      report_date: { $gte: start, $lte: end },
    });
    if (!reports.length) throw new Error("No reports found for this date");
    return reports;
  }

  static async deleteReport(id) {
    const report = await WorkDoneModel.findById(id);
    if (!report) throw new Error("Site work completion report not found. Please verify the report ID and try again");
    if (report.status === "Approved") {
      throw new Error("Approved reports cannot be deleted");
    }
    await WorkDoneModel.findByIdAndDelete(id);
  }
}

export default WorkDoneService;
