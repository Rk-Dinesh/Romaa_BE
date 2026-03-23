import IdcodeServices from "../../idcode/idcode.service.js";
import ContractorModel from "./contractor.model.js";
import ContractWorkerModel from "../contractemployee/contractemployee.model.js";

class ContractorService {
  // Create Contractor
  static async addContractor(contractorData) {
    const idname = "CONTRACTOR";
    const idcode = "CON";
    await IdcodeServices.addIdCode(idname, idcode);
    const contractor_id = await IdcodeServices.generateCode(idname);
    if (!contractor_id) throw new Error("Failed to generate contractor ID");

    const contractor = new ContractorModel({
      contractor_id,
      ...contractorData,
    });
    return await contractor.save();
  }

  // Get all contractors
  static async getAllContractors() {
    return await ContractorModel.find({ isDeleted: { $ne: true } });
  }

  // Dropdown select (id + name)
  static async getAllContractorsSelect() {
    return await ContractorModel.find({ isDeleted: { $ne: true } }).select(
      "contractor_id contractor_name wage_fixing assigned_projects"
    );
  }

  static async getContractorsByTenderId(tender_id) {
    return await ContractorModel.find({
      isDeleted: { $ne: true },
      "assigned_projects.tender_id": tender_id,
    }).select("contractor_id contractor_name contact_phone contact_email business_type status place_of_supply credit_day");
  }

  static async getAllContractorsSelectbyProject(tender_id) {
    return await ContractorModel.find({
      isDeleted: { $ne: true },
      "assigned_projects.tender_id": tender_id  ,
    }).select(
      "contractor_id contractor_name wage_fixing assigned_projects"
    );
  }

  // Get single contractor
  static async getContractorById(contractor_id) {
    return await ContractorModel.findOne({
      contractor_id,
      isDeleted: { $ne: true },
    });
  }

  // Get active contractors
  static async getActiveContractors() {
    return await ContractorModel.find({
      status: "ACTIVE",
      isDeleted: { $ne: true },
    });
  }

  // Update contractor
  static async updateContractor(contractor_id, updateData) {
    return await ContractorModel.findOneAndUpdate(
      { contractor_id, isDeleted: { $ne: true } },
      { $set: updateData },
      { new: true }
    );
  }

  // Soft delete contractor
  static async deleteContractor(contractor_id) {
    return await ContractorModel.findOneAndUpdate(
      { contractor_id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, status: "INACTIVE" } },
      { new: true }
    );
  }

  // Search contractors
  static async searchContractors(keyword) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return await ContractorModel.find({
      isDeleted: { $ne: true },
      $or: [
        { contractor_name: { $regex: escapedKeyword, $options: "i" } },
        { contact_email: { $regex: escapedKeyword, $options: "i" } },
        { contact_phone: { $regex: escapedKeyword, $options: "i" } },
      ],
    });
  }

  // Paginated contractors
  static async getContractorsPaginated(page, limit, search, fromdate, todate) {
    const query = { isDeleted: { $ne: true } };

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { contractor_name: { $regex: escapedSearch, $options: "i" } },
        { contact_email: { $regex: escapedSearch, $options: "i" } },
        { contact_phone: { $regex: escapedSearch, $options: "i" } },
        { contractor_id: { $regex: escapedSearch, $options: "i" } },
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

    const total = await ContractorModel.countDocuments(query);
    const contractors = await ContractorModel.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return { total, contractors };
  }

  // =============================================
  // NEW: Contractor with all employees
  // =============================================
  static async getContractorWithEmployees(contractor_id) {
    const contractor = await ContractorModel.findOne({
      contractor_id,
      isDeleted: { $ne: true },
    }).lean();
    if (!contractor) return null;

    const employees = await ContractWorkerModel.find({
      contractor_id,
      isDeleted: { $ne: true },
    })
      .select("-__v")
      .lean();

    return { ...contractor, employees };
  }

    static async getContractorWithEmployeesbyProject(contractor_id,tender_id) {
    const contractor = await ContractorModel.findOne({
      contractor_id,
      isDeleted: { $ne: true },
    }).lean();
    if (!contractor) return null;

    const employees = await ContractWorkerModel.find({
      contractor_id,
      site_assigned:tender_id,
      isDeleted: { $ne: true },
    })
      .select("-__v")
      .lean();

    return { ...contractor, employees };
  }

  // NEW: Paginated employees under a contractor
  static async getContractorEmployeesPaginated(
    contractor_id,
    page,
    limit,
    search
  ) {
    const query = { contractor_id, isDeleted: { $ne: true } };

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { employee_name: { $regex: escapedSearch, $options: "i" } },
        { contact_phone: { $regex: escapedSearch, $options: "i" } },
        { role: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const total = await ContractWorkerModel.countDocuments(query);
    const employees = await ContractWorkerModel.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return { total, employees };
  }

  // NEW: Assign project to contractor
  static async assignProject(contractor_id, projectData) {
    return await ContractorModel.findOneAndUpdate(
      { contractor_id, isDeleted: { $ne: true } },
      { $push: { assigned_projects: projectData } },
      { new: true }
    );
  }

  // NEW: Remove project assignment
  static async removeProject(contractor_id, tender_id) {
    return await ContractorModel.findOneAndUpdate(
      { contractor_id, isDeleted: { $ne: true } },
      {
        $set: {
          "assigned_projects.$[elem].status": "withdrawn",
        },
      },
      {
        arrayFilters: [{ "elem.tender_id": tender_id }],
        new: true,
      }
    );
  }

  // NEW: Get assigned projects
  static async getAssignedProjects(contractor_id) {
    const contractor = await ContractorModel.findOne(
      { contractor_id, isDeleted: { $ne: true } },
      { assigned_projects: 1, contractor_id: 1, contractor_name: 1 }
    ).lean();
    return contractor;
  }

  // NEW: Update account details
  static async updateAccountDetails(contractor_id, accountData) {
    return await ContractorModel.findOneAndUpdate(
      { contractor_id, isDeleted: { $ne: true } },
      { $set: { account_details: accountData } },
      { new: true }
    );
  }

  // NEW: Dashboard stats
  static async getDashboardStats() {
    const [contractorStats, workerStats] = await Promise.all([
      ContractorModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] },
            },
          },
        },
      ]),
      ContractWorkerModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const cs = contractorStats[0] || { total: 0, active: 0 };
    const ws = workerStats[0] || { total: 0, active: 0 };

    return {
      total_contractors: cs.total,
      active_contractors: cs.active,
      total_contract_workers: ws.total,
      active_workers: ws.active,
    };
  }
}

export default ContractorService;
