import WorkOrderRequestModel from "./workorderReqIssue.model.js";

class WorkOrderRequestService {

 static async create(workOrderData) {
    const workOrderRequest = new WorkOrderRequestModel(workOrderData);
    return await workOrderRequest.save(); // Returns the created document
  }

   static async getByProjectAndRequestId(projectId, requestId) {
    // Use findOne for a specific match
    return await WorkOrderRequestModel.findOne({ projectId, requestId });
  }

   static async getAllByProjectIdWithFields(projectId) {
    // Only selected fields: title, description, vendorQuotations
    return await WorkOrderRequestModel.find({ projectId })
      .select('title description vendorQuotations'); // field selection
  }

  static async getAllByProjectIdSelectedVendor(projectId) {
    // Only selected fields: title, description, vendorQuotations
    return await WorkOrderRequestModel.find({ projectId })
      .select('title description selectedVendor'); // field selection
  }

  // You can add more service methods like:
  static async findById(id) {
    return await WorkOrderRequestModel.findById(id);
  }

  static async updateById(id, updateData) {
    return await WorkOrderRequestModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  static async deleteById(id) {
    return await WorkOrderRequestModel.findByIdAndDelete(id);
  }

}

export default WorkOrderRequestService;
