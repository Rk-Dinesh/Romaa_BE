import IdcodeServices from "../../idcode/idcode.service.js";
import TenderModel from "../../tender/tender/tender.model.js";
import VendorPermittedModel from "../../tender/vendorpermitted/vendorpermitted.mode.js";
import VendorModel from "../vendor/vendor.model.js";
import PurchaseRequestModel from "./purchaseReqIssue.model.js";
import NotificationService from "../../notifications/notification.service.js";


class PurchaseRequestService {

  static async create(purchaseData) {
    const idname = "PurchaseRequest";
    const idcode = "POR";
    await IdcodeServices.addIdCode(idname, idcode);
    const requestId = await IdcodeServices.generateCode(idname);
    const tenderName = await TenderModel.findOne({ tender_id: purchaseData.projectId }).select("tender_name tender_project_name");
    if (!tenderName) throw new Error("Associated tender not found for purchase order request");
    const purchaseRequest = new PurchaseRequestModel({
      requestId,
      ...purchaseData,
      tender_name: tenderName.tender_name,
      tender_project_name: tenderName.tender_project_name,
    });

    const saved = await purchaseRequest.save();

    // Notify Purchase team about new request
    const purchaseRoles = await NotificationService.getRoleIdsByPermission("purchase", "request", "read");
    if (purchaseRoles.length > 0) {
      NotificationService.notify({
        title: "New Purchase Request",
        message: `Purchase request ${requestId} — ${purchaseData.title || "New request"} has been raised for project ${tenderName.tender_project_name}`,
        audienceType: "role",
        roles: purchaseRoles,
        category: "task",
        priority: "high",
        module: "purchase",
        reference: { model: "PurchaseRequest", documentId: saved._id },
        actionUrl: `/purchase/request`,
        actionLabel: "View Request",
      });
    }

    return saved;
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

  static async getAllByProjectIdForMaterialReceived(projectId, filters = {}) {
    const query = { projectId, status: "Purchase Order Issued" };

    if (filters.search) {
      const s = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { requestId:           { $regex: s, $options: "i" } },
        { title:               { $regex: s, $options: "i" } },
        { tender_name:         { $regex: s, $options: "i" } },
        { tender_project_name: { $regex: s, $options: "i" } },
        { "selectedVendor.vendor_name": { $regex: s, $options: "i" } },
      ];
    }

    if (filters.fromdate || filters.todate) {
      query.requestDate = {};
      if (filters.fromdate) query.requestDate.$gte = new Date(filters.fromdate);
      if (filters.todate) {
        const to = new Date(filters.todate);
        to.setHours(23, 59, 59, 999);
        query.requestDate.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      PurchaseRequestModel.find(query)
        .select("requestId projectId tender_name tender_project_name title description materialsRequired selectedVendor requestDate status")
        .sort({ requestDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PurchaseRequestModel.countDocuments(query),
    ]);

    return {
      data,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
      totalCount: total,
    };
  }

  static async _paginatedByStatus({ statusFilter, filters, sort, selectFields }) {
    const query = { status: statusFilter };

    if (filters.search) {
      const s = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { requestId:           { $regex: s, $options: "i" } },
        { title:               { $regex: s, $options: "i" } },
        { tender_name:         { $regex: s, $options: "i" } },
        { tender_project_name: { $regex: s, $options: "i" } },
        { "selectedVendor.vendor_name": { $regex: s, $options: "i" } },
      ];
    }

    if (filters.fromdate || filters.todate) {
      query.requestDate = {};
      if (filters.fromdate) query.requestDate.$gte = new Date(filters.fromdate);
      if (filters.todate) {
        const to = new Date(filters.todate);
        to.setHours(23, 59, 59, 999);
        query.requestDate.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      PurchaseRequestModel.find(query).select(selectFields).sort(sort).skip(skip).limit(limit).lean(),
      PurchaseRequestModel.countDocuments(query),
    ]);

    return {
      data,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
      totalCount: total,
    };
  }

  static async getAllByNewRequest(filters = {}) {
    return PurchaseRequestService._paginatedByStatus({
      statusFilter: "Request Raised",
      filters,
      sort: { requestId: -1 },
      selectFields: "requestId projectId tender_name tender_project_name title status requestDate requiredByDate siteDetails",
    });
  }

  static async getAllByQuotationRequested(filters = {}) {
    return PurchaseRequestService._paginatedByStatus({
      statusFilter: { $in: ["Quotation Requested", "Quotation Received", "Vendor Approved"] },
      filters,
      sort: { status: 1, requestDate: -1 },
      selectFields: "requestId projectId tender_name tender_project_name title status requestDate requiredByDate siteDetails",
    });
  }

  static async getAllByQuotationApproved(filters = {}) {
    return PurchaseRequestService._paginatedByStatus({
      statusFilter: { $in: ["Vendor Approved", "Purchase Order Issued", "Completed"] },
      filters,
      sort: { status: 1, requestDate: -1 },
      selectFields: "requestId projectId tender_name tender_project_name title status requestDate requiredByDate siteDetails",
    });
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
    if (!permittedRecord) throw new Error('No permitted vendor list found for the specified tender');

    // Vendor is permitted if found in permittedRecord.listOfPermittedVendors with a matching vendor_id
    const isPermitted = permittedRecord.listOfPermittedVendors.some(
      v => v.vendor_id === vendorId
    );
    if (!isPermitted) throw new Error('Vendor is not in the permitted vendor list for this tender');


    // 2. Check vendor is registered in Vendor collection (for auto-fill details)
    const vendor = await VendorModel.findOne({ vendor_id: vendorId });
    if (!vendor) throw new Error("Vendor is not registered in the system");

    const purchasePermittedVendor = await PurchaseRequestModel.findById({ _id: purchaseRequestId });
    if (!purchasePermittedVendor) throw new Error('Purchase order request not found');
    if (purchasePermittedVendor.status === "Vendor Approved" || purchasePermittedVendor.status === "Purchase Order Issued" || purchasePermittedVendor.status === "Completed" ) throw new Error('Purchase order already approved, no further quotations allowed');
    const isPermittedVendor = purchasePermittedVendor.permittedVendor.some(
      v => v.vendorId === vendorId
    );
    if (!isPermittedVendor) throw new Error('Vendor is not in the permitted vendor list for this purchase order request');

    // 3. Compute totalQuotedValue from quoteItems
    const totalQuotedValue = Array.isArray(quoteData.quoteItems)
      ? quoteData.quoteItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0)
      : 0;

    // 4. Build vendorQuotation object
    const vendorQuotation = {
      ...quoteData,
      vendorId,
      vendorName: vendor.contact_person,
      place_of_supply: vendor.place_of_supply,
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
    
    if (!result) throw new Error('Purchase order request not found');
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
      throw new Error(`Purchase order request '${purchaseRequestId}' not found`);
    }

    // 2. Find the specific quotation to approve
    const vendorQuotation = purchaseRequest.vendorQuotations.find(
      (q) => q.quotationId === quotationId
    );

    if (!vendorQuotation) {
      throw new Error(`Vendor quotation '${quotationId}' not found in this purchase order request`);
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

    // Notify Finance + Purchase team about quotation approval
    const [financeRoles, purchaseRoles] = await Promise.all([
      NotificationService.getRoleIdsByPermission("finance", "purchase_bill", "read"),
      NotificationService.getRoleIdsByPermission("purchase", "order", "read"),
    ]);
    const notifyRoles = [...new Set([...financeRoles, ...purchaseRoles].map(String))];
    if (notifyRoles.length > 0) {
      NotificationService.notify({
        title: "Purchase Quotation Approved",
        message: `Quotation approved for ${purchaseRequestId} — Vendor: ${vendorQuotation.vendorName}, Amount: ${vendorQuotation.totalQuotedValue}`,
        audienceType: "role",
        roles: notifyRoles,
        category: "approval",
        priority: "critical",
        module: "purchase",
        reference: { model: "PurchaseRequest", documentId: purchaseRequest._id },
        actionUrl: `/purchase/enquiry`,
        actionLabel: "View PO",
      });
    }

    return purchaseRequest;
  }

  static async rejectVendorQuotation({ purchaseRequestId, quotationId }) {
    // 1. Find the PurchaseRequest by custom requestId (e.g., "POR013")
    const purchaseRequest = await PurchaseRequestModel.findOne({ requestId: purchaseRequestId });
    
    if (!purchaseRequest) {
      throw new Error(`Purchase order request '${purchaseRequestId}' not found`);
    }

    // 2. Find the specific quotation
    const vendorQuotation = purchaseRequest.vendorQuotations.find(
      (q) => q.quotationId === quotationId
    );

    if (!vendorQuotation) {
      throw new Error(`Vendor quotation '${quotationId}' not found in this purchase order request`);
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
  static async updateStatus(requestId, status, permittedVendor = [],materialsRequired=[]) {

    // 1. Create the update object with the new status
    const updateData = { status };

    // 2. If vendors are provided, add them to the update object
    // This will overwrite the existing permittedVendor list with the new one
    if (permittedVendor && permittedVendor.length > 0) {
      updateData.permittedVendor = permittedVendor;
    }

    if (materialsRequired && materialsRequired.length > 0) {
      updateData.materialsRequired = materialsRequired;
    }

    // 3. Perform the update
    const updated = await PurchaseRequestModel.findOneAndUpdate(
      { requestId },
      { $set: updateData }, // $set ensures we update specific fields
      { new: true }
    );

    if (!updated) {
      throw new Error(`Purchase order request '${requestId}' not found`);
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
      throw new Error(`Purchase order request '${requestId}' not found`);
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
    // 1. Match the specific document
    { $match: { requestId: requestId } },

    // 2. Isolate the approved quotation
    {
      $addFields: {
        selectedVendor: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$vendorQuotations",
                as: "quote",
                cond: { $eq: ["$$quote._id", "$selectedVendor.approvedQuotationId"] }
              }
            },
            0
          ]
        }
      }
    },

    // 3. Map through the quoteItems and "populate" from materialsRequired
    {
      $addFields: {
        "selectedVendor.quoteItems": {
          $map: {
            input: "$selectedVendor.quoteItems",
            as: "item",
            in: {
              $mergeObjects: [
                "$$item",
                {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$materialsRequired",
                        as: "req",
                        // We match by materialName since materialId in quoteItems 
                        // often refers to the _id of the requirement
                        cond: { $eq: ["$$req.materialName", "$$item.materialName"] }
                      }
                    },
                    0
                  ]
                }
              ]
            }
          }
        }
      }
    },

    // 4. Cleanup: Remove the massive vendorQuotations list
    {
      $project: {
        vendorQuotations: 0,
        // We keep materialsRequired if you still need the original list, 
        // otherwise you can 0 it out here too.
      }
    }
  ]);

  return result[0];
}

// static async getRequestWithApprovedQuotation(requestId) {
//   const result = await PurchaseRequestModel.aggregate([
//     // 1. Match the specific document by custom requestId
//     { $match: { requestId: requestId } },

//     // 2. Extract the approved quotation details into a temporary field
//     {
//       $addFields: {
//         tempApprovedQuote: {
//           $arrayElemAt: [
//             {
//               $filter: {
//                 input: "$vendorQuotations", 
//                 as: "quote",
//                 cond: { 
//                   $eq: ["$$quote._id", "$selectedVendor.approvedQuotationId"] 
//                 }
//               }
//             },
//             0 
//           ]
//         }
//       }
//     },

//     // 3. Merge the existing 'selectedVendor' object with the extracted quote details
//     {
//       $addFields: {
//         selectedVendor: {
//           $mergeObjects: ["$selectedVendor", "$tempApprovedQuote"]
//         }
//       }
//     },

//     // 4. Cleanup: Exclude the big list and the temp field
//     { 
//       $project: { 
//         vendorQuotations: 0,
//         tempApprovedQuote: 0 
//       } 
//     }
//   ]);

//   return result[0];
// }

}

export default PurchaseRequestService;
