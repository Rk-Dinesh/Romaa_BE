import IdcodeServices from "../../idcode/idcode.service.js";
import VendorPermittedModel from "../../tender/vendorpermitted/vendorpermitted.mode.js";
import VendorModel from "../vendor/vendor.model.js";
import PurchaseRequestModel from "./purchaseReqIssue.model.js";


class PurchaseRequestService {

 static async create(purchaseData) {
    const idname = "PurchaseRequest";
    const idcode = "POR";
    await IdcodeServices.addIdCode(idname, idcode);
    const requestId = await IdcodeServices.generateCode(idname);

    const purchaseRequest = new PurchaseRequestModel({
      requestId,
      ...purchaseData,
    });

    return await purchaseRequest.save(); // Returns the created document
  }

   static async getByProjectAndRequestId(projectId, requestId) {
    // Use findOne for a specific match
    return await PurchaseRequestModel.findOne({ projectId, requestId });
  }

  static async getAllByProjectIdWithFields(projectId) {
    // Only selected fields: requestId, title, description, vendorQuotations, siteDetails, materialsRequired, status, requestDate
  return await PurchaseRequestModel.find({ projectId }).select(
    "requestId projectId title description vendorQuotations siteDetails siteDetails  materialsRequired status requestDate requestedByDate "
  ); // field selection
}

  static async getAllByProjectIdSelectedVendor(projectId) {
    // Only selected fields: title, description, vendorQuotations
    return await PurchaseRequestModel.find({ projectId })
      .select('title description selectedVendor'); // field selection
  }

  // You can add more service methods like:
  static async findById(id) {
    return await PurchaseRequestModel.findById(id);
  }

  static async updateById(id, updateData) {
    return await PurchaseRequestModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  static async deleteById(id) {
    return await PurchaseRequestModel.findByIdAndDelete(id);
  }

  static async addVendorQuotationWithTenderCheck({ purchaseRequestId, vendorId, quoteData, tenderId }) {
    // 1. Check vendor is permitted for tender
    const permittedRecord = await VendorPermittedModel.findOne({ tender_id: tenderId });
    if (!permittedRecord) throw new Error('TenderId not found');

    // Vendor is permitted if found in permittedRecord.listOfPermittedVendors with a matching vendor_id
    const isPermitted = permittedRecord.listOfPermittedVendors.some(
      v => v.vendor_id === vendorId
    );
    if (!isPermitted) throw new Error('Not a permitted vendor');

    // 2. Check vendor is registered in Vendor collection (for auto-fill details)
   const vendor = await VendorModel.findOne({ vendor_id: vendorId });
    if (!vendor) throw new Error("Vendor not registered");

    // 3. Compute totalQuotedValue from quoteItems
    const totalQuotedValue = Array.isArray(quoteData.quoteItems)
      ? quoteData.quoteItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0)
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
    const result = await PurchaseRequestModel.findByIdAndUpdate(
      purchaseRequestId,
      { $push: { vendorQuotations: vendorQuotation } },
      { new: true }
    );
    if (!result) throw new Error('PurchaseRequest not found');
    return result;
  }

  static async getVendorQuotationByQuotationId(quotationId) {
    return await PurchaseRequestModel.findOne(
      { "vendorQuotations.quotationId": quotationId },
      { "vendorQuotations.$": 1 } // Only include the first matching array element
    );
  }

  static async approveVendorQuotation({ purchaseRequestId, quotationId }) {
    // 1. Find the WorkOrderRequest containing the quotation
    const purchaseRequest = await PurchaseRequestModel.findOne({ _id: purchaseRequestId });
    if (!purchaseRequest) throw new Error('purchaseRequest not found');

    // 2. Find the vendorQuotation to approve by quotationId
    const vendorQuotation = purchaseRequest.vendorQuotations.find(
      (q) => q.quotationId === quotationId
    );
    if (!vendorQuotation) throw new Error('Vendor quotation not found');

    // 3. Update approvalStatus = "Approved" for this quotation
    vendorQuotation.approvalStatus = "Approved";
    // You may want to set all other quotations to "Rejected" (optional business logic)
    purchaseRequest.vendorQuotations.forEach((q) => {
      if (q.quotationId !== quotationId) q.approvalStatus = "Rejected";
    });

    // 4. Set selectedVendor details
    purchaseRequest.selectedVendor = {
      vendorId: vendorQuotation.vendorId,
      vendorName: vendorQuotation.vendorName,
      approvedQuotationId: vendorQuotation._id, // Mongoose embedded doc _id
    };

    // 5. Save changes
    await purchaseRequest.save();

    return purchaseRequest;
  }

   static async getAllByProjectIdSelectedVendorWithQuotation(projectId) {
    // Step 1: Get docs with selected fields
    const docs = await PurchaseRequestModel.find({ projectId })
      .select('title description selectedVendor vendorQuotations')
      .lean();

    // Step 2: For each doc, find the approvedQuotationId in vendorQuotations
    return docs.map(doc => {
      let approvedQuotation = null;
      if (
        doc.selectedVendor &&
        doc.selectedVendor.approvedQuotationId &&
        doc.vendorQuotations
      ) {
        approvedQuotation = doc.vendorQuotations.find(
          vq => vq._id.toString() === doc.selectedVendor.approvedQuotationId.toString()
        );
      }
      return {
        title: doc.title,
        description: doc.description,
        selectedVendor: {
          ...doc.selectedVendor,
          approvedQuotation: approvedQuotation || null
        }
      };
    });
  }

static async updateStatus(requestId, status) {
    const updated = await PurchaseRequestModel.findOneAndUpdate(
      { requestId },
      { status },
      { new: true }
    );
    return updated;
  }

  // Get all requests with status "Quotation Requested"
  static async getQuotationRequested() {
    const requests = await PurchaseRequestModel.find({ status: "Quotation Requested" });
    return requests;
  }

}

export default PurchaseRequestService;
