import IdcodeServices from "../../idcode/idcode.service.js";
import TenderModel from "../../tender/tender/tender.model.js";
import VendorPermittedModel from "../../tender/vendorpermitted/vendorpermitted.mode.js";
import VendorModel from "../vendor/vendor.model.js";
import PurchaseRequestModel from "./purchaseReqIssue.model.js";


class PurchaseRequestService {

  static async create(purchaseData) {
    const idname = "PurchaseRequest";
    const idcode = "POR";
    await IdcodeServices.addIdCode(idname, idcode);
    const requestId = await IdcodeServices.generateCode(idname);
    const tenderName = await TenderModel.findOne({ tender_id: purchaseData.projectId }).select("tender_name tender_project_name");
    if (!tenderName) throw new Error("Tender not found");
    const purchaseRequest = new PurchaseRequestModel({
      requestId,
      ...purchaseData,
      tender_name: tenderName.tender_name,
      tender_project_name: tenderName.tender_project_name,
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
      "requestId projectId title description vendorQuotations siteDetails materialsRequired status requestDate requiredByDate "
    ).sort({  requestDate: -1 }); // field selection
  }

  static async getAllByProjectIdForMaterialReceived(projectId) {
    return await PurchaseRequestModel.find({ projectId , status: "Purchase Order Issued"}).select(
      "requestId projectId title description  materialsRequired "
    ); 
  }

  static async getAllByNewRequest() {
    return await PurchaseRequestModel.find({ status: "Request Raised" }).select(
      "requestId projectId tender_name tender_project_name title  status requestDate requiredByDate  siteDetails "
    ).sort({ requestId: -1 }); // field selection
  }

  static async getAllByQuotationRequested() {
    return await PurchaseRequestModel.find({
      status: { $in: ["Quotation Requested", "Quotation Received","Vendor Approved"] }
    })
      .select("requestId projectId tender_name tender_project_name title status requestDate requiredByDate siteDetails")
      .sort({ status: 1, requestDate: -1 }); // 1. Status Ascending (Received first), 2. Newest dates first
  }

    static async getAllByQuotationApproved() {
    return await PurchaseRequestModel.find({
      status: { $in: ["Vendor Approved","Purchase Order Issued","Completed"] }
    })
      .select("requestId projectId tender_name tender_project_name title status requestDate requiredByDate siteDetails")
      .sort({ status: 1, requestDate: -1 }); // 1. Status Ascending (Received first), 2. Newest dates first
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

    const purchasePermittedVendor = await PurchaseRequestModel.findById({ _id: purchaseRequestId });
    if (!purchasePermittedVendor) throw new Error('PurchaseRequest not found');
    if (purchasePermittedVendor.status === "Vendor Approved" || purchasePermittedVendor.status === "Purchase Order Issued" || purchasePermittedVendor.status === "Completed" ) throw new Error('Already Approved , No more quotations allowed');
    const isPermittedVendor = purchasePermittedVendor.permittedVendor.some(
      v => v.vendorId === vendorId
    );
    if (!isPermittedVendor) throw new Error('Not a permitted vendor');

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
      { $set: { status: "Quotation Received" } },
      { new: true }
    );

    result.status = "Quotation Received";
    await result.save();
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
    // 1. Find the PurchaseRequest by the custom 'requestId' (e.g., POR011)
    // Changed from { _id: purchaseRequestId } to { requestId: purchaseRequestId }
    const purchaseRequest = await PurchaseRequestModel.findOne({ requestId: purchaseRequestId });

    if (!purchaseRequest) {
      throw new Error(`Purchase Request with ID '${purchaseRequestId}' not found`);
    }

    // 2. Find the specific quotation to approve
    const vendorQuotation = purchaseRequest.vendorQuotations.find(
      (q) => q.quotationId === quotationId
    );

    if (!vendorQuotation) {
      throw new Error(`Quotation ID '${quotationId}' not found in this request`);
    }

    // 3. Update approval statuses
    purchaseRequest.vendorQuotations.forEach((q) => {
      if (q.quotationId === quotationId) {
        q.approvalStatus = "Approved";
      } else {
        q.approvalStatus = "Rejected";
      }
    });

    // 4. Set selectedVendor details
    purchaseRequest.selectedVendor = {
      vendorId: vendorQuotation.vendorId,
      vendorName: vendorQuotation.vendorName,
      approvedQuotationId: vendorQuotation._id,
    };

    // 5. Initialize Purchase Order Details
    purchaseRequest.purchaseOrder = {
      issueDate: new Date(),
      approvedAmount: vendorQuotation.totalQuotedValue,
      progressStatus: "In Progress",
    };

    // 6. Update overall workflow status
    purchaseRequest.status = "Vendor Approved";



    // 7. Save changes
    await purchaseRequest.save();

    return purchaseRequest;
  }

  static async rejectVendorQuotation({ purchaseRequestId, quotationId }) {
    // 1. Find the PurchaseRequest by custom requestId (e.g., "POR013")
    const purchaseRequest = await PurchaseRequestModel.findOne({ requestId: purchaseRequestId });
    
    if (!purchaseRequest) {
      throw new Error(`Purchase Request with ID '${purchaseRequestId}' not found`);
    }

    // 2. Find the specific quotation
    const vendorQuotation = purchaseRequest.vendorQuotations.find(
      (q) => q.quotationId === quotationId
    );

    if (!vendorQuotation) {
      throw new Error(`Quotation ID '${quotationId}' not found`);
    }

    // 3. Update only this quotation's status to "Rejected"
    vendorQuotation.approvalStatus = "Rejected";

    // 4. Save changes
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

  // Update status and optionally set the permitted vendors
  static async updateStatus(requestId, status, permittedVendor = []) {

    // 1. Create the update object with the new status
    const updateData = { status };

    // 2. If vendors are provided, add them to the update object
    // This will overwrite the existing permittedVendor list with the new one
    if (permittedVendor && permittedVendor.length > 0) {
      updateData.permittedVendor = permittedVendor;
    }

    // 3. Perform the update
    const updated = await PurchaseRequestModel.findOneAndUpdate(
      { requestId },
      { $set: updateData }, // $set ensures we update specific fields
      { new: true }
    );

    if (!updated) {
      throw new Error(`Purchase Request with ID ${requestId} not found`);
    }

    return updated;
  }

  static async updateStatusRequest(requestId, status) {
    const updated = await PurchaseRequestModel.findOneAndUpdate(
      { requestId },
      { $set: { status } },
      { new: true }
    );
    if (!updated) {
      throw new Error(`Purchase Request with ID ${requestId} not found`);
    }
    return updated;
  }

  // Get all requests with status "Quotation Requested"
  static async getQuotationRequested(projectId, requestId) {
    const requests = await PurchaseRequestModel.find({
      projectId,
      requestId,
      status: { $in: ["Quotation Requested", "Quotation Received","Vendor Approved"] }
    });
    return requests;
  }

static async getRequestWithApprovedQuotation(requestId) {
  const result = await PurchaseRequestModel.aggregate([
    // 1. Match the specific document by custom requestId
    { $match: { requestId: requestId } },

    // 2. Extract the approved quotation details into a temporary field
    {
      $addFields: {
        tempApprovedQuote: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$vendorQuotations", 
                as: "quote",
                cond: { 
                  $eq: ["$$quote._id", "$selectedVendor.approvedQuotationId"] 
                }
              }
            },
            0 
          ]
        }
      }
    },

    // 3. Merge the existing 'selectedVendor' object with the extracted quote details
    {
      $addFields: {
        selectedVendor: {
          $mergeObjects: ["$selectedVendor", "$tempApprovedQuote"]
        }
      }
    },

    // 4. Cleanup: Exclude the big list and the temp field
    { 
      $project: { 
        vendorQuotations: 0,
        tempApprovedQuote: 0 
      } 
    }
  ]);

  return result[0];
}

}

export default PurchaseRequestService;
