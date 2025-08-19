import IdcodeServices from "../../idcode/idcode.service.js";
import ContractorModel from "./contractor.model.js";


class ContractorService {
  // Create Contractor with unique contractor_id
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
    return await ContractorModel.find();
  }

  // Get contractor by contractor_id
  static async getContractorById(contractor_id) {
    return await ContractorModel.findOne({ contractor_id });
  }

  // Get active contractors
  static async getActiveContractors() {
    return await ContractorModel.find({ status: "ACTIVE" });
  }

  // Update contractor by ID
  static async updateContractor(contractor_id, updateData) {
    return await ContractorModel.findOneAndUpdate(
      { contractor_id },
      { $set: updateData },
      { new: true }
    );
  }

  // Delete contractor by ID
  static async deleteContractor(contractor_id) {
    return await ContractorModel.findOneAndDelete({ contractor_id });
  }

  // Search contractors by company_name, contact_email, contact_phone
  static async searchContractors(keyword) {
    return await ContractorModel.find({
      $or: [
        { company_name: { $regex: keyword, $options: "i" } },
        { contact_email: { $regex: keyword, $options: "i" } },
        { contact_phone: { $regex: keyword, $options: "i" } },
      ]
    });
  }

  // Paginated, search and date-filtered contractors
  static async getContractorsPaginated(page, limit, search, fromdate, todate) {
    const query = {};

    if (search) {
      query.$or = [
        { company_name: { $regex: search, $options: "i" } },
        { contact_email: { $regex: search, $options: "i" } },
        { contact_phone: { $regex: search, $options: "i" } },
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
}

export default ContractorService;
