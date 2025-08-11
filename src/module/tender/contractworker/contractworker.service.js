import ContractWorkerModel from "./contractworker.model.js";
import TenderModel from "../tender/tender.model.js";
import ContractEmployeeModel from "../../hr/contractemployee/contractemployee.model.js";

class ContractWorkerService {
  
  // Add contract workers to a tender (sync TenderModel.contractor_details)
  static async addContractWorkers(tender_id, workers) {
    let record = await ContractWorkerModel.findOne({ tender_id });

    if (!record) {
      record = new ContractWorkerModel({
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
    const record = await ContractWorkerModel.findOne({ tender_id });
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
    return await ContractWorkerModel.updateOne(
      { tender_id, "listOfContractWorkers.contractWorker_id": worker_id },
      { $set: { "listOfContractWorkers.$": { contractWorker_id: worker_id, ...updateData } } }
    );
  }

  // Remove a worker from a tender and TenderModel.contractor_details
  static async removeContractWorker(tender_id, worker_id) {
    const result = await ContractWorkerModel.updateOne(
      { tender_id },
      { $pull: { listOfContractWorkers: { contractWorker_id: worker_id } } }
    );

    await TenderModel.updateOne(
      { tender_id },
      { $pull: { contractor_details: worker_id } }
    );

    return result;
  }
}

export default ContractWorkerService;
