import WorkOrderRequestService from "./workorderReqIssue.service.js";


export const createWorkOrderRequest = async (req, res) => {
  try {
    const result = await WorkOrderRequestService.create(req.body);
    res.status(201).json({ message: 'WorkOrderRequest created successfully', data: result });
  } catch (error) {
    res.status(400).json({ message: 'Error creating WorkOrderRequest', error: error.message });
    console.log(error.message);
  }
};

export const getAllByNewRequest = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workorder = await WorkOrderRequestService.getAllByNewRequest(projectId);
    res.status(200).json({ data: workorder });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequests', error: error.message });
  }
};

export const getQuotationRequested = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const requests = await WorkOrderRequestService.getQuotationRequested(projectId, requestId);
    res.json({ data: requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getAllByQuotationApproved = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workorder = await WorkOrderRequestService.getAllByQuotationApproved(projectId);
    res.status(200).json({ data: workorder });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequests', error: error.message });
  }
};


export const approveVendorQuotation = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { quotationId } = req.body;

    if (!quotationId) return res.status(400).json({ message: 'quotationId is required' });

    const updatedWorkOrderRequest = await WorkOrderRequestService.approveVendorQuotation({
      workOrderId,
      quotationId,
    });

    res.status(200).json({
      message: 'Vendor quotation approved and selectedVendor updated.',
      data: updatedWorkOrderRequest,
      success: true,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const rejectVendor = async (req, res) => {
  try {
    const { workOrderId } = req.params; 
    const { quotationId } = req.body;

    if (!workOrderId || !quotationId) {
      return res.status(400).json({ success: false, message: "IDs required" });
    }

    const result = await WorkOrderRequestService.rejectVendorQuotation({
      workOrderId,
      quotationId,
    });

    res.status(200).json({
      success: true,
      message: "Vendor quotation rejected successfully.",
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const postVendorQuotationWithTenderCheck = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { vendorId, tenderId, quoteItems, ...rest } = req.body;

    if (!vendorId) return res.status(400).json({ message: 'vendorId is required' });
    if (!tenderId) return res.status(400).json({ message: 'tenderId is required' });
    if (!Array.isArray(quoteItems) || quoteItems.length === 0)
      return res.status(400).json({ message: 'quoteItems are required' });

    const updatedWorkOrderRequest = await WorkOrderRequestService.addVendorQuotationWithTenderCheck({
      workOrderId,
      vendorId,
      quoteData: { quoteItems, ...rest },
      tenderId
    });

    res.status(201).json({
      message: 'Vendor quotation added successfully',
      data: updatedWorkOrderRequest,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getWorkOrderByProjectAndRequestId = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const workorder = await WorkOrderRequestService.getByProjectAndRequestId(projectId, requestId);

    if (!workorder) {
      return res.status(404).json({ message: 'WorkOrderRequests not found' });
    }
    res.status(200).json({ data: workorder });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequests', error: error.message });
  }
};

export const getQuotationApproved = async (req, res) => {
  try {
    const { requestId } = req.params;
    const requests = await WorkOrderRequestService.getRequestWithApprovedQuotation(requestId);
    res.json({ data: requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};