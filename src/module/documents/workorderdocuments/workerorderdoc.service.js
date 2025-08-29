import WorkOrderDocumentModel from "./workorderdoc.model.js";



class WorkerOrderDocumentService {

   static async getWorkOrderDocumentByTenderId(tender_id,workOrder_id) {
    return await WorkOrderDocumentModel.findOne({ tender_id ,workOrder_id });
  }
}

export default WorkerOrderDocumentService;
