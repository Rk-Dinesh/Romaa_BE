import WorkOrderRequestService from "./workorderReqIssue.service.js";


export const createWorkOrderRequest = async (req, res) => {
  try {
    const result = await WorkOrderRequestService.create(req.body);
    res.status(201).json({ status: true, message: 'Work order request created successfully', data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getAllByNewRequest = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workorder = await WorkOrderRequestService.getAllByNewRequest(projectId);
    res.status(200).json({ status: true, data: workorder });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getQuotationRequested = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const requests = await WorkOrderRequestService.getQuotationRequested(projectId, requestId);
    res.status(200).json({ status: true, data: requests });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllByQuotationApproved = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workorder = await WorkOrderRequestService.getAllByQuotationApproved(projectId);
    res.status(200).json({ status: true, data: workorder });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllByWorkOrderIssuedForWorkDone = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workorder = await WorkOrderRequestService.getAllByWorkOrderIssuedForWorkDone(projectId);
    res.status(200).json({ status: true, data: workorder });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllByWorkOrderIssuedForWorkDoneMaterial = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const workorder = await WorkOrderRequestService.getAllByWorkOrderIssuedForWorkDoneMaterial(projectId, requestId);
    res.status(200).json({ status: true, data: workorder });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const approveContractorQuotation = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { quotationId } = req.body;

    if (!quotationId) return res.status(400).json({ status: false, message: 'Quotation ID is required to approve a contractor quotation' });

    const updatedWorkOrderRequest = await WorkOrderRequestService.approveVendorQuotation({
      workOrderId,
      quotationId,
    });

    res.status(200).json({
      status: true,
      message: 'Contractor quotation approved and work order issued successfully',
      data: updatedWorkOrderRequest,
    });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const rejectContractor = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { quotationId } = req.body;

    if (!workOrderId || !quotationId) {
      return res.status(400).json({ status: false, message: "Work order ID and quotation ID are required" });
    }

    const result = await WorkOrderRequestService.rejectVendorQuotation({
      workOrderId,
      quotationId,
    });

    res.status(200).json({
      status: true,
      message: "Contractor quotation rejected successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const postContractorQuotationWithTenderCheck = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { contractorId, tenderId, quoteItems, ...rest } = req.body;

    if (!contractorId) return res.status(400).json({ status: false, message: 'Contractor ID is required to submit a quotation' });
    if (!tenderId) return res.status(400).json({ status: false, message: 'Tender ID is required to verify contractor permission' });
    if (!Array.isArray(quoteItems) || quoteItems.length === 0)
      return res.status(400).json({ status: false, message: 'At least one quote item is required to submit a contractor quotation' });

    const updatedWorkOrderRequest = await WorkOrderRequestService.addContractorQuotationWithTenderCheck({
      workOrderId,
      contractorId,
      quoteData: { quoteItems, ...rest },
      tenderId
    });

    res.status(201).json({
      status: true,
      message: 'Contractor quotation submitted successfully',
      data: updatedWorkOrderRequest,
    });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getWorkOrderByProjectAndRequestId = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const workorder = await WorkOrderRequestService.getByProjectAndRequestId(projectId, requestId);

    if (!workorder) {
      return res.status(404).json({ status: false, message: 'Work order request not found. Please verify the project and request IDs' });
    }
    res.status(200).json({ status: true, data: workorder });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getQuotationApproved = async (req, res) => {
  try {
    const { requestId } = req.params;
    const requests = await WorkOrderRequestService.getRequestWithApprovedQuotation(requestId);
    res.status(200).json({ status: true, data: requests });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateStatusRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    const result = await WorkOrderRequestService.updateStatusRequest(requestId, status);

    res.status(200).json({
      status: true,
      message: "Work order request status updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
