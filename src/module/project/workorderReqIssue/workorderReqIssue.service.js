import IdcodeServices from "../../idcode/idcode.service.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import VendorPermittedModel from "../../tender/vendorpermitted/vendorpermitted.mode.js";
import WorkOrderRequestModel from "./workorderReqIssue.model.js";

class WorkOrderRequestService {
  static async create(workOrderData) {
    const idname = "WorkOrderRequest";
    const idcode = "WO";
    await IdcodeServices.addIdCode(idname, idcode);
    const requestId = await IdcodeServices.generateCode(idname);

    const workOrderRequest = new WorkOrderRequestModel({
      requestId,
      ...workOrderData,
    });

    return await workOrderRequest.save(); // Returns the created document
  }

  static async getByProjectAndRequestId(projectId, requestId) {
    // Use findOne for a specific match
    return await WorkOrderRequestModel.findOne({ projectId, requestId });
  }

  static async getAllByProjectIdWithFields(projectId) {
    // Only selected fields: title, description, vendorQuotations
    return await WorkOrderRequestModel.find({ projectId }).select(
      "title description vendorQuotations requestId"
    ); // field selection
  }

    static async getAllByProjectIdWithFieldsApproved(projectId) {
    // Only selected fields: title, description, vendorQuotations
    return await WorkOrderRequestModel.find({ projectId, status:"Approved" }).select(
      "title description vendorQuotations requestId"
    ); // field selection
  }

  static async getAllByProjectIdSelectedVendor(projectId) {
    // Only selected fields: title, description, vendorQuotations
    return await WorkOrderRequestModel.find({ projectId }).select(
      "title description selectedVendor"
    ); // field selection
  }

  // You can add more service methods like:
  static async findById(id) {
    return await WorkOrderRequestModel.findById(id);
  }

  static async updateById(id, updateData) {
    return await WorkOrderRequestModel.findByIdAndUpdate(id, updateData, {
      new: true,
    });
  }

  static async deleteById(id) {
    return await WorkOrderRequestModel.findByIdAndDelete(id);
  }

  static async addVendorQuotationWithTenderCheck({
    workOrderRequestId,
    vendorId,
    quoteData,
    tenderId,
  }) {
    // 1. Check vendor is permitted for tender
    const permittedRecord = await VendorPermittedModel.findOne({
      tender_id: tenderId,
    });
    if (!permittedRecord) throw new Error("TenderId not found");

    // Vendor is permitted if found in permittedRecord.listOfPermittedVendors with a matching vendor_id
    const isPermitted = permittedRecord.listOfPermittedVendors.some(
      (v) => v.vendor_id === vendorId
    );
    if (!isPermitted) throw new Error("Not a permitted vendor");

    // 2. Check vendor is registered in Vendor collection (for auto-fill details)
    const vendor = await VendorModel.findOne({ vendor_id: vendorId });
    if (!vendor) throw new Error("Vendor not registered");

    // 3. Compute totalQuotedValue from quoteItems
    const totalQuotedValue = Array.isArray(quoteData.quoteItems)
      ? quoteData.quoteItems.reduce(
          (sum, item) => sum + (item.totalAmount || 0),
          0
        )
      : 0;

    // 4. Build vendorQuotation object
    const vendorQuotation = {
      ...quoteData,
      vendorId,
      vendorName: vendor.contact_person,
      contact: vendor.contact_phone, // ensure your VendorModel has 'contact'
      address: `${vendor.address.street}, ${vendor.address.city}, ${vendor.address.state}, ${vendor.address.country} - ${vendor.address.pincode}`,
      totalQuotedValue,
    };

    // 5. Push quotation to WorkOrderRequest
    const result = await WorkOrderRequestModel.findByIdAndUpdate(
      workOrderRequestId,
      { $push: { vendorQuotations: vendorQuotation } },
      { new: true }
    );
    if (!result) throw new Error("WorkOrderRequest not found");
    return result;
  }

  static async getVendorQuotationByQuotationId(quotationId) {
    return await WorkOrderRequestModel.findOne(
      { "vendorQuotations.quotationId": quotationId },
      { "vendorQuotations.$": 1 } // Only include the first matching array element
    );
  }

  static async approveVendorQuotation({ workOrderRequestId, quotationId }) {
    // 1. Find the WorkOrderRequest containing the quotation
    const workOrder = await WorkOrderRequestModel.findOne({
      _id: workOrderRequestId,
    });
    if (!workOrder) throw new Error("WorkOrderRequest not found");

    // 2. Find the vendorQuotation to approve by quotationId
    const vendorQuotation = workOrder.vendorQuotations.find(
      (q) => q.quotationId === quotationId
    );
    if (!vendorQuotation) throw new Error("Vendor quotation not found");

    // 3. Update approvalStatus = "Approved" for this quotation
    vendorQuotation.approvalStatus = "Approved";
    // You may want to set all other quotations to "Rejected" (optional business logic)
    workOrder.vendorQuotations.forEach((q) => {
      if (q.quotationId !== quotationId) q.approvalStatus = "Rejected";
    });

    // 4. Set selectedVendor details
    workOrder.selectedVendor = {
      vendorId: vendorQuotation.vendorId,
      vendorName: vendorQuotation.vendorName,
      approvedQuotationId: vendorQuotation._id, // Mongoose embedded doc _id
    };

     workOrder.status = "Approved"

    // 5. Save changes
    await workOrder.save();

    return workOrder;
  }

  static async getAllByProjectIdSelectedVendorWithQuotation(projectId) {
    // Step 1: Get docs with selected fields
    const docs = await WorkOrderRequestModel.find({ projectId })
      .select("title description selectedVendor vendorQuotations")
      .lean();

    // Step 2: For each doc, find the approvedQuotationId in vendorQuotations
    return docs.map((doc) => {
      let approvedQuotation = null;
      if (
        doc.selectedVendor &&
        doc.selectedVendor.approvedQuotationId &&
        doc.vendorQuotations
      ) {
        approvedQuotation = doc.vendorQuotations.find(
          (vq) =>
            vq._id.toString() ===
            doc.selectedVendor.approvedQuotationId.toString()
        );
      }
      return {
        title: doc.title,
        description: doc.description,
        selectedVendor: {
          ...doc.selectedVendor,
          approvedQuotation: approvedQuotation || null,
        },
      };
    });
  }
}

export default WorkOrderRequestService;
