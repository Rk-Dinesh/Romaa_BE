import IdcodeServices from "../../idcode/idcode.service.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import RAQuantityModel from "../../tender/rateanalyisquantites/rateanalysisquantities.model.js";
import TenderModel from "../../tender/tender/tender.model.js";
import VendorPermittedModel from "../../tender/vendorpermitted/vendorpermitted.mode.js";
import WorkOrderRequestModel from "./workorderReqIssue.model.js";

class WorkOrderRequestService {

  static async create(workOrderData) {
    const idname = "WorkOrderRequest";
    const idcode = "WO";

    await IdcodeServices.addIdCode(idname, idcode);
    const requestId = await IdcodeServices.generateCode(idname);

    const tenderDoc = await TenderModel.findOne({
      tender_id: workOrderData.projectId,
    }).select("tender_id tender_name tender_project_name");

    const raQuantityDoc = await RAQuantityModel.findOne({
      tender_id: workOrderData.projectId,
    });

    if (!raQuantityDoc) {
      throw new Error("Tender Quantities not found");
    }

    if (workOrderData.materialsRequired && workOrderData.materialsRequired.length > 0) {

      workOrderData.materialsRequired.forEach((reqItem) => {

        const dbItem = raQuantityDoc.quantites.contractor.find(
          (item) => item.item_description === reqItem.materialName
        );

        if (dbItem) {
          const reqQty = Number(reqItem.quantity);

          if (dbItem.ex_quantity < reqQty) {
            throw new Error(`Insufficient quantity for ${reqItem.materialName}. Available: ${dbItem.ex_quantity}`);
          }

          dbItem.ex_quantity = dbItem.ex_quantity - reqQty;
        }
      });

      await raQuantityDoc.save();
    }

    const workOrderRequest = new WorkOrderRequestModel({
      requestId,
      ...workOrderData,
      materialsRequired: workOrderData.materialsRequired.map(m => ({
        materialName: m.materialName,
        quantity: m.quantity,
        unit: m.unit,
        ex_quantity: m.quantity,
      })),
      tender_name: tenderDoc.tender_name,
      tender_project_name: tenderDoc.tender_project_name,
      permittedVendor: workOrderData.permittedVendor.map(v => ({
        vendorId: v.vendorId,
        vendorName: v.vendorName
      })),
      workOrder: {
        issueDate: new Date(),
        startDate: new Date(),
        expectedCompletionDate: new Date(),
        progressStatus: "Not Started",
        remarks: "",
      },

    });

    return await workOrderRequest.save();
  }



  static async getAllByNewRequest(projectId) {
    return await WorkOrderRequestModel.find({ projectId, status: { $in: ["Request Raised", "Quotation Received"] } }).select(
      "requestId projectId tender_name tender_project_name title  status requestDate requiredByDate  siteDetails "
    ).sort({ requestId: -1 }); // field selection
  }

  static async getQuotationRequested(projectId, requestId) {
    const requests = await WorkOrderRequestModel.find({
      projectId,
      requestId,
      status: { $in: ["Request Raised", "Quotation Received"] }
    });
    return requests;
  }

  static async getAllByQuotationApproved(projectId) {
    return await WorkOrderRequestModel.find({
      projectId,
      status: { $in: ["Vendor Approved", "Work Order Issued", "Completed"] }
    })
      .select("requestId projectId tender_name tender_project_name title status requestDate requiredByDate siteDetails")
      .sort({ requestId: -1 }); // 1. Status Ascending (Received first), 2. Newest dates first
  }

  static async getAllByWorkOrderIssuedForWorkDone(projectId) {
    return await WorkOrderRequestModel.find({
      projectId,
      status: { $in: ["Work Order Issued"] }
    })
      .select("requestId projectId ")
      .sort({ requestId: -1 }); // 1. Status Ascending (Received first), 2. Newest dates first
  }

  static async getAllByWorkOrderIssuedForWorkDoneMaterial(projectId, requestId) {
    return await WorkOrderRequestModel.find({
      projectId,
      requestId,
      status: { $in: ["Work Order Issued"] }
    })
      .select("requestId projectId tender_name tender_project_name title status requestDate requiredByDate siteDetails materialsRequired");
  }

  static async approveVendorQuotation({ workOrderId, quotationId }) {
    // 1. Find the PurchaseRequest by the custom 'requestId' (e.g., POR011)
    // Changed from { _id: purchaseRequestId } to { requestId: purchaseRequestId }
    const workOrderRequest = await WorkOrderRequestModel.findOne({ requestId: workOrderId });

    if (!workOrderRequest) {
      throw new Error(`Purchase Request with ID '${workOrderId}' not found`);
    }

    // 2. Find the specific quotation to approve
    const vendorQuotation = workOrderRequest.vendorQuotations.find(
      (q) => q.quotationId === quotationId
    );

    if (!vendorQuotation) {
      throw new Error(`Quotation ID '${quotationId}' not found in this request`);
    }

    // 3. Update approval statuses
    workOrderRequest.vendorQuotations.forEach((q) => {
      if (q.quotationId === quotationId) {
        q.approvalStatus = "Approved";
      } else {
        q.approvalStatus = "Rejected";
      }
    });

    // 4. Set selectedVendor details
    workOrderRequest.selectedVendor = {
      vendorId: vendorQuotation.vendorId,
      vendorName: vendorQuotation.vendorName,
      approvedQuotationId: vendorQuotation._id,
    };

    // 5. Initialize Purchase Order Details
    workOrderRequest.workOrder = {
      issueDate: new Date(),
      approvedAmount: vendorQuotation.totalQuotedValue,
      progressStatus: "In Progress",
    };

    // 6. Update overall workflow status
    workOrderRequest.status = "Work Order Issued";



    // 7. Save changes
    await workOrderRequest.save();

    return workOrderRequest;
  }

  static async rejectVendorQuotation({ workOrderId, quotationId }) {
    // 1. Find the PurchaseRequest by custom requestId (e.g., "POR013")
    const workOrderRequest = await WorkOrderRequestModel.findOne({ requestId: workOrderId });

    if (!workOrderRequest) {
      throw new Error(`Purchase Request with ID '${workOrderId}' not found`);
    }

    // 2. Find the specific quotation
    const vendorQuotation = workOrderRequest.vendorQuotations.find(
      (q) => q.quotationId === quotationId
    );

    if (!vendorQuotation) {
      throw new Error(`Quotation ID '${quotationId}' not found`);
    }

    // 3. Update only this quotation's status to "Rejected"
    vendorQuotation.approvalStatus = "Rejected";

    // 4. Save changes
    await workOrderRequest.save();

    return workOrderRequest;
  }

  static async addVendorQuotationWithTenderCheck({ workOrderId, vendorId, quoteData, tenderId }) {
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

    const purchasePermittedVendor = await WorkOrderRequestModel.findById({ _id: workOrderId });
    if (!purchasePermittedVendor) throw new Error('PurchaseRequest not found');
    if (purchasePermittedVendor.status === "Vendor Approved" || purchasePermittedVendor.status === "Purchase Order Issued" || purchasePermittedVendor.status === "Completed") throw new Error('Already Approved , No more quotations allowed');
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
    const result = await WorkOrderRequestModel.findByIdAndUpdate(
      workOrderId,
      { $push: { vendorQuotations: vendorQuotation } },
      { $set: { status: "Quotation Received" } },
      { new: true }
    );

    result.status = "Quotation Received";
    await result.save();
    if (!result) throw new Error('WorkOrderRequest not found');
    return result;
  }

  static async getByProjectAndRequestId(projectId, requestId) {
    // Use findOne for a specific match
    return await WorkOrderRequestModel.findOne({ projectId, requestId });
  }

  static async getRequestWithApprovedQuotation(requestId) {
    const result = await WorkOrderRequestModel.aggregate([
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

    static async updateStatusRequest(requestId, status) {
      const updated = await WorkOrderRequestModel.findOneAndUpdate(
        { requestId },
        { $set: { status } },
        { new: true }
      );
      if (!updated) {
        throw new Error(`WorkOrderRequest with ID ${requestId} not found`);
      }
      return updated;
    }

}

export default WorkOrderRequestService;
