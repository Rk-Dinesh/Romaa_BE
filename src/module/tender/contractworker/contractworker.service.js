import PermiitedcontractWorkerModel from "./contractworker.model.js";
import TenderModel from "../tender/tender.model.js";
import ContractEmployeeModel from "../../hr/contractemployee/contractemployee.model.js";

class ContractWorkerService {
  
  // Add contract workers to a tender (sync TenderModel.contractor_details)
  static async addContractWorkers(tender_id, workers) {
    let record = await PermiitedcontractWorkerModel.findOne({ tender_id });

    if (!record) {
      record = new PermiitedcontractWorkerModel({
        tender_id,
        listOfContractWorkers: workers
      });
    } else {
      record.listOfContractWorkers.push(...workers);
    }

    const savedRecord = await record.save();

    // Push worker IDs to TenderModel.contractor_details without duplicates
    const workerIds = workers.map(w => w.contractWorker_id);
    await TenderModel.updateOne(
      { tender_id },
      { $addToSet: { contractor_details: { $each: workerIds } } }
    );

    return savedRecord;
  }

  // Get contract workers for a tender with populated details
  static async getContractWorkersByTender(tender_id) {
    const record = await PermiitedcontractWorkerModel.findOne({ tender_id });
    if (!record) return null;

    const populatedList = await Promise.all(
      record.listOfContractWorkers.map(async (cw) => {
        const details = await ContractEmployeeModel.findOne({ worker_id: cw.contractWorker_id }).lean();
        return {
          ...cw.toObject(),
          worker_details: details || null
        };
      })
    );

    return { tender_id, contract_workers: populatedList };
  }

  // Update a specific worker entry for a tender
  static async updateContractWorker(tender_id, worker_id, updateData) {
    return await PermiitedcontractWorkerModel.updateOne(
      { tender_id, "listOfContractWorkers.contractWorker_id": worker_id },
      { $set: { "listOfContractWorkers.$": { contractWorker_id: worker_id, ...updateData } } }
    );
  }

  // Remove a worker from a tender and TenderModel.contractor_details
  static async removeContractWorker(tender_id, worker_id) {
    const result = await PermiitedcontractWorkerModel.updateOne(
      { tender_id },
      { $pull: { listOfContractWorkers: { contractWorker_id: worker_id } } }
    );

    await TenderModel.updateOne(
      { tender_id },
      { $pull: { contractor_details: worker_id } }
    );

    return result;
  }

    static async removePermittedContractor(tender_id, contractWorker_id) {
      // Remove from VendorPermittedModel
      const result = await PermiitedcontractWorkerModel.updateOne(
        { tender_id },
        { $pull: { listOfContractWorkers: { contractWorker_id } } }
      );
    }

   static async getcontractorPaginated(tender_id, page = 1, limit = 10, search = "") {
      // 1️⃣ Fetch only the vendor array for a given tender_id
      const data = await PermiitedcontractWorkerModel.findOne(
        { tender_id },
        { listOfContractWorkers: 1, _id: 0 }
      ).lean();
  
      if (!data || !data.listOfContractWorkers) {
        return { total: 0, contractors: [] };
      }
  
      let contractors = data.listOfContractWorkers;
  
      // 2️⃣ Optional search filter
      if (search) {
        const regex = new RegExp(search, "i");
        contractors = contractors.filter(
          v =>
            regex.test(v.contractWorker_id || "") ||
            regex.test(v.contractWorker_name || "") ||
            regex.test(v.contractStart_date || "") ||
            regex.test(v.contractEnd_date || "")
        );
      }
  
      // 3️⃣ Pagination
      const total = contractors.length;
      const startIndex = (page - 1) * limit;
      const paginatedVendors = contractors.slice(startIndex, startIndex + limit);
  
      return { total, contractors: paginatedVendors };
    }
}

export default ContractWorkerService;
