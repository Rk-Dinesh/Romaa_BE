import ContractWorkerModel from "./contractemployee.model.js";
import ContractorModel from "../contractors/contractor.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

class ContractWorkerService {
  // Create worker — auto-links to contractor
  static async addWorker(workerData) {
    const idname = "CONTRACTWORKER";
    const idcode = "CW";
    await IdcodeServices.addIdCode(idname, idcode);
    const worker_id = await IdcodeServices.generateCode(idname);
    if (!worker_id) throw new Error("Unable to generate contract worker ID. Please contact system administrator");

    if (!workerData.contractor_id) {
      throw new Error("Contractor ID is required to register a contract worker");
    }

    // Verify contractor exists
    const contractor = await ContractorModel.findOne({
      contractor_id: workerData.contractor_id,
      isDeleted: { $ne: true },
    });
    if (!contractor) throw new Error("Associated contractor not found. Please verify the contractor ID before adding a worker");

    const worker = new ContractWorkerModel({ worker_id, ...workerData });
    const saved = await worker.save();

    // Add to contractor's employees array
    await ContractorModel.findOneAndUpdate(
      { contractor_id: workerData.contractor_id },
      { $addToSet: { employees: worker_id }, $inc: { total_employees: 1 } }
    );

    return saved;
  }

  // Get all workers
  static async getAllWorkers() {
    return await ContractWorkerModel.find({ isDeleted: { $ne: true } });
  }

  // Dropdown (id + name)
  static async getAllEmployeeIDNAME() {
    return await ContractWorkerModel.find({ isDeleted: { $ne: true } }).select(
      "worker_id employee_name contractor_id"
    );
  }

  // Get single worker
  static async getWorkerById(worker_id) {
    return await ContractWorkerModel.findOne({
      worker_id,
      isDeleted: { $ne: true },
    });
  }

  // Get active workers
  static async getActiveWorkers() {
    return await ContractWorkerModel.find({
      status: "ACTIVE",
      isDeleted: { $ne: true },
    });
  }

  // Search workers
  static async searchWorkers(keyword) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return await ContractWorkerModel.find({
      isDeleted: { $ne: true },
      $or: [
        { employee_name: { $regex: escapedKeyword, $options: "i" } },
        { contact_phone: { $regex: escapedKeyword, $options: "i" } },
        { role: { $regex: escapedKeyword, $options: "i" } },
      ],
    });
  }

  // Update worker
  static async updateWorker(worker_id, updateData) {
    return await ContractWorkerModel.findOneAndUpdate(
      { worker_id, isDeleted: { $ne: true } },
      { $set: updateData },
      { new: true }
    );
  }

  // Soft delete worker — removes from contractor too
  static async deleteWorker(worker_id) {
    const worker = await ContractWorkerModel.findOneAndUpdate(
      { worker_id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, status: "LEFT" } },
      { new: true }
    );

    if (worker) {
      await ContractorModel.findOneAndUpdate(
        { contractor_id: worker.contractor_id },
        { $pull: { employees: worker_id }, $inc: { total_employees: -1 } }
      );
    }

    return worker;
  }

  // Paginated workers list
  static async getContractWorkersPaginated(
    page,
    limit,
    search,
    fromdate,
    todate
  ) {
    const query = { isDeleted: { $ne: true } };

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { employee_name: { $regex: escapedSearch, $options: "i" } },
        { contractor_id: { $regex: escapedSearch, $options: "i" } },
        { contact_phone: { $regex: escapedSearch, $options: "i" } },
        { site_assigned: { $regex: escapedSearch, $options: "i" } },
      ];
    }

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

  // NEW: Get all workers by contractor_id
  static async getWorkersByContractor(contractor_id) {
    return await ContractWorkerModel.find({
      contractor_id,
      isDeleted: { $ne: true },
    });
  }

  // NEW: Transfer worker to a different contractor
  static async transferWorker(worker_id, new_contractor_id) {
    const worker = await ContractWorkerModel.findOne({
      worker_id,
      isDeleted: { $ne: true },
    });
    if (!worker) throw new Error("Contract worker record not found. Please verify the worker ID and try again");

    // Verify new contractor exists
    const newContractor = await ContractorModel.findOne({
      contractor_id: new_contractor_id,
      isDeleted: { $ne: true },
    });
    if (!newContractor) throw new Error("Target contractor not found. Please verify the contractor ID for transfer");

    const old_contractor_id = worker.contractor_id;

    // Update worker's contractor_id
    worker.contractor_id = new_contractor_id;
    await worker.save();

    // Remove from old contractor, add to new
    await Promise.all([
      ContractorModel.findOneAndUpdate(
        { contractor_id: old_contractor_id },
        { $pull: { employees: worker_id }, $inc: { total_employees: -1 } }
      ),
      ContractorModel.findOneAndUpdate(
        { contractor_id: new_contractor_id },
        { $addToSet: { employees: worker_id }, $inc: { total_employees: 1 } }
      ),
    ]);

    return worker;
  }

  // NEW: Assign/change site for a worker
  static async assignSite(worker_id, site_assigned) {
    return await ContractWorkerModel.findOneAndUpdate(
      { worker_id, isDeleted: { $ne: true } },
      { $set: { site_assigned } },
      { new: true }
    );
  }
}

export default ContractWorkerService;
