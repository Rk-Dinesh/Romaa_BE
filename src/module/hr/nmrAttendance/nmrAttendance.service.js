import NMRAttendanceModel from "./nmrattendance.model.js";
import DLRModel from "../../site/dlp/dlp.model.js";

class NMRAttendanceService {
  /**
   * Create NMR attendance manually.
   * payload: { attendance_date, project_id, contractor_id, attendance_list[], verified_by }
   */
  static async createAttendance(payload) {
    const record = new NMRAttendanceModel({
      attendance_date: new Date(payload.attendance_date),
      project_id: payload.project_id,
      contractor_id: payload.contractor_id,
      attendance_list: (payload.attendance_list || []).map((w) => ({
        worker_id: w.worker_id,
        worker_name: w.worker_name || "",
        category: w.category || "",
        status: w.status || "PRESENT",
        in_time: w.in_time || "",
        out_time: w.out_time || "",
        daily_wage: Number(w.daily_wage) || 0,
      })),
      verified_by: payload.verified_by || "",
    });

    return await record.save(); // pre-save calculates total_present & total_payable_amount
  }

  /**
   * Create NMR attendance seeded from an approved/pending DLP report.
   * Pulls worker entries from the DLR work_entries into attendance_list.
   */
  static async createFromDLP(dlr_id, { verified_by } = {}) {
    const dlr = await DLRModel.findById(dlr_id);
    if (!dlr) throw new Error("Daily Labour Report not found. Please verify the DLP report ID and try again");

    // Prevent duplicates: one NMR per project+contractor+date
    const existing = await NMRAttendanceModel.findOne({
      project_id: dlr.project_id,
      contractor_id: dlr.contractor_id,
      attendance_date: dlr.report_date,
    });
    if (existing) throw new Error("NMR attendance record already exists for this contractor on the selected date");

    const attendance_list = dlr.work_entries.map((e) => ({
      worker_id: e.worker_id,
      worker_name: e.worker_name || "",
      category: e.category || "",
      status: e.status || "PRESENT",
      in_time: "",
      out_time: "",
      daily_wage: Number(e.daily_wage) || 0,
    }));

    const record = new NMRAttendanceModel({
      attendance_date: dlr.report_date,
      project_id: dlr.project_id,
      contractor_id: dlr.contractor_id,
      attendance_list,
      verified_by: verified_by || "",
    });

    return await record.save();
  }

  // Get all records for a project — list view (no attendance_list)
  static async getByProject(project_id, { fromdate, todate, contractor_id, page, limit, search } = {}) {
    const filter = { project_id };
    if (contractor_id) filter.contractor_id = contractor_id;
    if (fromdate || todate) {
      filter.attendance_date = {};
      if (fromdate) filter.attendance_date.$gte = new Date(fromdate);
      if (todate)   filter.attendance_date.$lte = new Date(todate);
    }
    if (search) {
      const s = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.contractor_id = { $regex: s, $options: "i" };
    }
    const pg    = Math.max(1, parseInt(page)  || 1);
    const lim   = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip  = (pg - 1) * lim;
    const [data, total] = await Promise.all([
      NMRAttendanceModel.find(filter).select("-attendance_list").sort({ attendance_date: -1 }).skip(skip).limit(lim).lean(),
      NMRAttendanceModel.countDocuments(filter),
    ]);
    return { data, total, page: pg, limit: lim };
  }

  // Get a single record with full attendance_list
  static async getById(id) {
    const record = await NMRAttendanceModel.findById(id);
    if (!record) throw new Error("NMR attendance record not found. Please verify the record ID and try again");
    return record;
  }

  // Get attendance history for a specific worker across a project
  static async getWorkerHistory(project_id, worker_id, { from, to } = {}) {
    const filter = { project_id, "attendance_list.worker_id": worker_id };
    if (from || to) {
      filter.attendance_date = {};
      if (from) filter.attendance_date.$gte = new Date(from);
      if (to) filter.attendance_date.$lte = new Date(to);
    }

    const records = await NMRAttendanceModel.find(filter).sort({ attendance_date: -1 });

    const result = [];
    for (const r of records) {
      const entries = r.attendance_list.filter((w) => w.worker_id === worker_id);
      for (const w of entries) {
        result.push({
          record_id: r._id,
          attendance_date: r.attendance_date,
          contractor_id: r.contractor_id,
          record_status: r.status,
          worker_id: w.worker_id,
          worker_name: w.worker_name,
          category: w.category,
          status: w.status,
          in_time: w.in_time,
          out_time: w.out_time,
          daily_wage: w.daily_wage,
          effective_wage:
            w.status === "PRESENT"
              ? w.daily_wage
              : w.status === "HALF_DAY"
              ? w.daily_wage / 2
              : 0,
        });
      }
    }
    return result;
  }

  // Summary per worker: total present/half/absent days + payable amount
  static async getSummary(project_id, { from, to, contractor_id } = {}) {
    const filter = { project_id };
    if (contractor_id) filter.contractor_id = contractor_id;
    if (from || to) {
      filter.attendance_date = {};
      if (from) filter.attendance_date.$gte = new Date(from);
      if (to) filter.attendance_date.$lte = new Date(to);
    }

    const records = await NMRAttendanceModel.find(filter);

    const workerMap = new Map();
    for (const r of records) {
      for (const w of r.attendance_list) {
        if (!workerMap.has(w.worker_id)) {
          workerMap.set(w.worker_id, {
            worker_id: w.worker_id,
            worker_name: w.worker_name,
            category: w.category,
            contractor_id: r.contractor_id,
            present_days: 0,
            half_days: 0,
            absent_days: 0,
            total_payable: 0,
          });
        }
        const entry = workerMap.get(w.worker_id);
        if (w.status === "PRESENT") {
          entry.present_days += 1;
          entry.total_payable += w.daily_wage;
        } else if (w.status === "HALF_DAY") {
          entry.half_days += 1;
          entry.total_payable += w.daily_wage / 2;
        } else {
          entry.absent_days += 1;
        }
      }
    }
    return Array.from(workerMap.values());
  }

  // Update attendance_list on a SUBMITTED record
  static async updateAttendance(id, payload) {
    const record = await NMRAttendanceModel.findById(id);
    if (!record) throw new Error("NMR attendance record not found. Please verify the record ID and try again");
    if (record.status !== "SUBMITTED") throw new Error("Only submitted attendance records can be modified. Current status: " + record.status);

    if (payload.attendance_list !== undefined) {
      record.attendance_list = payload.attendance_list.map((w) => ({
        worker_id: w.worker_id,
        worker_name: w.worker_name || "",
        category: w.category || "",
        status: w.status || "PRESENT",
        in_time: w.in_time || "",
        out_time: w.out_time || "",
        daily_wage: Number(w.daily_wage) || 0,
      }));
    }
    if (payload.verified_by !== undefined) record.verified_by = payload.verified_by;

    return await record.save();
  }

  // Approve a record
  static async approveAttendance(id, verified_by) {
    const record = await NMRAttendanceModel.findById(id);
    if (!record) throw new Error("NMR attendance record not found. Please verify the record ID and try again");
    record.status = "APPROVED";
    if (verified_by) record.verified_by = verified_by;
    return await record.save();
  }
}

export default NMRAttendanceService;
