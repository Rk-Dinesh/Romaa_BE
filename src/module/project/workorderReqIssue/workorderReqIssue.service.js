import IdcodeServices from "../../idcode/idcode.service.js";
import ContractorModel from "../../hr/contractors/contractor.model.js";
import RAQuantityModel from "../../tender/rateanalyisquantites/rateanalysisquantities.model.js";
import TenderModel from "../../tender/tender/tender.model.js";
import WorkOrderRequestModel from "./workorderReqIssue.model.js";
import NotificationService from "../../notifications/notification.service.js";

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
      throw new Error("Tender quantities not found. Please verify the tender ID and ensure rate analysis quantities exist");
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
        detailedDescription: m.detailedDescription,
        quantity: m.quantity,
        unit: m.unit,
        ex_quantity: m.quantity,
      })),
      tender_name: tenderDoc.tender_name,
      tender_project_name: tenderDoc.tender_project_name,
      permittedContractor: workOrderData.permittedContractor.map(c => ({
        contractorId: c.contractorId,
        contractorName: c.contractorName
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
      status: { $in: ["Contractor Approved", "Work Order Issued", "Completed"] }
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
      throw new Error(`Work order with ID '${workOrderId}' not found. Please verify the ID and try again`);
    }

    // 2. Find the specific quotation to approve
    const contractorQuotation = workOrderRequest.contractorQuotations.find(
      (q) => q.quotationId === quotationId
    );

    if (!contractorQuotation) {
      throw new Error(`Contractor quotation '${quotationId}' not found in this work order request`);
    }

    // 3. Update approval statuses
    workOrderRequest.contractorQuotations.forEach((q) => {
      if (q.quotationId === quotationId) {
        q.approvalStatus = "Approved";
      } else {
        q.approvalStatus = "Rejected";
      }
    });

    // 4. Set selectedContractor details
    workOrderRequest.selectedContractor = {
      contractorId: contractorQuotation.contractorId,
      contractorName: contractorQuotation.contractorName,
      approvedQuotationId: contractorQuotation._id,
    };

    // 5. Initialize Work Order Details
    workOrderRequest.workOrder = {
      issueDate: new Date(),
      approvedAmount: contractorQuotation.totalQuotedValue,
      progressStatus: "In Progress",
    };

    // 6. Update overall workflow status
    workOrderRequest.status = "Work Order Issued";

    // 7. Save changes
    await workOrderRequest.save();

    // Notify project team about WO approval
    const tender = await TenderModel.findOne({ tender_id: workOrderRequest.projectId }).select("_id").lean();
    if (tender) {
      NotificationService.notify({
        title: "Work Order Quotation Approved",
        message: `WO ${workOrderId} approved — Contractor: ${contractorQuotation.contractorName}, Amount: ${contractorQuotation.totalQuotedValue}`,
        audienceType: "project",
        projects: [tender._id],
        category: "approval",
        priority: "critical",
        module: "project",
        reference: { model: "WorkOrderRequest", documentId: workOrderRequest._id },
        actionUrl: `/projects/woissuance`,
        actionLabel: "View Work Order",
      });
    }

    return workOrderRequest;
  }

  static async rejectVendorQuotation({ workOrderId, quotationId }) {
    // 1. Find the PurchaseRequest by custom requestId (e.g., "POR013")
    const workOrderRequest = await WorkOrderRequestModel.findOne({ requestId: workOrderId });

    if (!workOrderRequest) {
      throw new Error(`Work order with ID '${workOrderId}' not found. Please verify the ID and try again`);
    }

    // 2. Find the specific quotation
    const contractorQuotation = workOrderRequest.contractorQuotations.find(
      (q) => q.quotationId === quotationId
    );

    if (!contractorQuotation) {
      throw new Error(`Contractor quotation '${quotationId}' not found in this work order request`);
    }

    // 3. Update only this quotation's status to "Rejected"
    contractorQuotation.approvalStatus = "Rejected";

    // 4. Save changes
    await workOrderRequest.save();

    return workOrderRequest;
  }

  static async addContractorQuotationWithTenderCheck({ workOrderId, contractorId, quoteData, tenderId }) {
    // 1. Check contractor is assigned to this tender
    const contractor = await ContractorModel.findOne({
      contractor_id: contractorId,
      "assigned_projects.tender_id": tenderId,
      isDeleted: { $ne: true },
    });
    if (!contractor) throw new Error('Contractor is not assigned to this tender. Please verify the contractor and tender details');

    // 2. Check work order exists and is in a valid state
    const workOrderRequest = await WorkOrderRequestModel.findById({ _id: workOrderId });
    if (!workOrderRequest) throw new Error('Work order request not found. Please verify the ID and try again');
    if (workOrderRequest.status === "Contractor Approved" || workOrderRequest.status === "Work Order Issued" || workOrderRequest.status === "Completed") throw new Error('Work order already approved. No further quotations are allowed');
    const isPermittedContractor = workOrderRequest.permittedContractor.some(
      c => c.contractorId === contractorId
    );
    if (!isPermittedContractor) throw new Error('Contractor is not permitted for this work order request');

    // 3. Compute totalQuotedValue from quoteItems
    const totalQuotedValue = Array.isArray(quoteData.quoteItems)
      ? quoteData.quoteItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0)
      : 0;

    // 4. Build contractorQuotation object
    const contractorQuotation = {
      ...quoteData,
      contractorId,
      contractorName: contractor.contractor_name,
      contact: contractor.contact_phone,
      address: `${contractor.address.street}, ${contractor.address.city}, ${contractor.address.state}, ${contractor.address.country} - ${contractor.address.pincode}`,
      totalQuotedValue,
    };

    // 5. Push quotation to WorkOrderRequest
    const result = await WorkOrderRequestModel.findByIdAndUpdate(
      workOrderId,
      { $push: { contractorQuotations: contractorQuotation } },
      { $set: { status: "Quotation Received" } },
      { new: true }
    );

    result.status = "Quotation Received";
    await result.save();
    if (!result) throw new Error('Work order request not found. Please verify the ID and try again');
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
                  input: "$contractorQuotations",
                  as: "quote",
                  cond: {
                    $eq: ["$$quote._id", "$selectedContractor.approvedQuotationId"]
                  }
                }
              },
              0
            ]
          }
        }
      },

      // 3. Merge the existing 'selectedContractor' object with the extracted quote details
      {
        $addFields: {
          selectedContractor: {
            $mergeObjects: ["$selectedContractor", "$tempApprovedQuote"]
          }
        }
      },

      // 4. Cleanup: Exclude the big list and the temp field
      {
        $project: {
          contractorQuotations: 0,
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
        throw new Error(`Work order request with ID '${requestId}' not found. Please verify the ID and try again`);
      }
      return updated;
    }

}

export default WorkOrderRequestService;
