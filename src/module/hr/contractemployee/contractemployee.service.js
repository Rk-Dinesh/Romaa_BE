import ContractWorkerModel from "./contractemployee.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

class ContractWorkerService {
  // Create worker
  static async addWorker(workerData) {
    const idname = "CONTRACTWORKER";
    const idcode = "CW";
    await IdcodeServices.addIdCode(idname, idcode);
    const worker_id = await IdcodeServices.generateCode(idname);
    if (!worker_id) throw new Error("Failed to generate worker ID");

    const worker = new ContractWorkerModel({
      worker_id,
      ...workerData
    });
    return await worker.save();
  }

  // Get all workers
  static async getAllWorkers() {
    return await ContractWorkerModel.find();
  }

    static async getAllEmployeeIDNAME() {
      return ContractWorkerModel.find().select("worker_id employee_name");
    }

  // Get worker by worker_id
  static async getWorkerById(worker_id) {
    return await ContractWorkerModel.findOne({ worker_id });
  }

  // Get active workers
  static async getActiveWorkers() {
    return await ContractWorkerModel.find({ status: "ACTIVE" });
  }

  // Search
  static async searchWorkers(keyword) {
    return await ContractWorkerModel.find({
      $or: [
        { employee_name: { $regex: keyword, $options: "i" } },
        { contractor_name: { $regex: keyword, $options: "i" } },
        { contact_phone: { $regex: keyword, $options: "i" } },
      ]
    });
  }

  // Update worker info
  static async updateWorker(worker_id, updateData) {
    return await ContractWorkerModel.findOneAndUpdate(
      { worker_id },
      { $set: updateData },
      { new: true }
    );
  }

  // Delete worker
  static async deleteWorker(worker_id) {
    return await ContractWorkerModel.findOneAndDelete({ worker_id });
  }

  // Mark attendance (push if not exists for today)
  static async markAttendance(worker_id, date, present, remarks = "") {
    return await ContractWorkerModel.updateOne(
      { worker_id, "daily_attendance.date": { $ne: date } },
      { $push: { daily_attendance: { date, present, remarks } } }
    );
  }

  // Update attendance for a given date
  static async updateAttendance(worker_id, date, present, remarks = "") {
    return await ContractWorkerModel.updateOne(
      { worker_id, "daily_attendance.date": date },
      { $set: { "daily_attendance.$.present": present, "daily_attendance.$.remarks": remarks } }
    );
  }

  // Get attendance records for date range
  static async getAttendance(worker_id, startDate, endDate) {
    const worker = await ContractWorkerModel.findOne(
      { worker_id },
      { daily_attendance: 1, _id: 0 }
    );

    if (!worker) return null;

    const filtered = worker.daily_attendance.filter(
      att => att.date >= new Date(startDate) && att.date <= new Date(endDate)
    );

    return filtered;
  }

    static async getContractWorkersPaginated(page, limit, search, fromdate, todate) {
    const query = {};

    // Keyword Search on multiple fields
    if (search) {
      query.$or = [
        { employee_name: { $regex: search, $options: "i" } },
        { contractor_name: { $regex: search, $options: "i" } },
        { contact_phone: { $regex: search, $options: "i" } },
        { site_assigned: { $regex: search, $options: "i" } },
      ];
    }

    // Date Filtering on createdAt
    if (fromdate || todate) {
      query.createdAt = {};
      if (fromdate) query.createdAt.$gte = new Date(fromdate);
      if (todate) {
        const endOfDay = new Date(todate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        query.createdAt.$lte = endOfDay;
      }
    }

    const total = await ContractWorkerModel.countDocuments(query);
    const contractWorkers = await ContractWorkerModel.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return { total, contractWorkers };
  }
}

export default ContractWorkerService;



