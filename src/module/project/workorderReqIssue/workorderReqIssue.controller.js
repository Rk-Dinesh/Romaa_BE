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

export const getWorkOrderByProjectAndRequestId = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const workOrder = await WorkOrderRequestService.getByProjectAndRequestId(projectId, requestId);

    if (!workOrder) {
      return res.status(404).json({ message: 'WorkOrderRequest not found' });
    }
    res.status(200).json({ data: workOrder });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequest', error: error.message });
  }
};

export const getAllWorkOrdersByProjectId = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workOrders = await WorkOrderRequestService.getAllByProjectIdWithFields(projectId);
    res.status(200).json({ data: workOrders });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequests', error: error.message });
  }
};

export const getAllWorkOrdersBySelectedVendor = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workOrders = await WorkOrderRequestService.getAllByProjectIdSelectedVendor(projectId);
    res.status(200).json({ data: workOrders });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequests', error: error.message });
  }
};

export const postVendorQuotationWithTenderCheck = async (req, res) => {
  try {
    const { workOrderRequestId } = req.params;
    const { vendorId, tenderId, quoteItems, ...rest } = req.body;

    if (!vendorId) return res.status(400).json({ message: 'vendorId is required' });
    if (!tenderId) return res.status(400).json({ message: 'tenderId is required' });
    if (!Array.isArray(quoteItems) || quoteItems.length === 0)
      return res.status(400).json({ message: 'quoteItems are required' });

    const updatedWorkOrderRequest = await WorkOrderRequestService.addVendorQuotationWithTenderCheck({
      workOrderRequestId,
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

export const getVendorQuotationByQuotationId = async (req, res) => {
  try {
    const { quotationId } = req.params;
    const doc = await WorkOrderRequestService.getVendorQuotationByQuotationId(quotationId);

    if (!doc || !doc.vendorQuotations || doc.vendorQuotations.length === 0) {
      return res.status(404).json({ message: 'Quotation not found' });
    }
    // Return only the matched vendor quotation details
    res.status(200).json({ data: doc.vendorQuotations[0] });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const approveVendorQuotation = async (req, res) => {
  try {
    const { workOrderRequestId } = req.params;
    const { quotationId } = req.body;

    if (!quotationId) return res.status(400).json({ message: 'quotationId is required' });

    const updatedWorkOrderRequest = await WorkOrderRequestService.approveVendorQuotation({
      workOrderRequestId,
      quotationId,
    });

    res.status(200).json({
      message: 'Vendor quotation approved and selectedVendor updated.',
      data: updatedWorkOrderRequest,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllByProjectIdSelectedVendorWithQuotation = async (req, res) => {
  try {
    const { projectId } = req.params;
    const data = await WorkOrderRequestService.getAllByProjectIdSelectedVendorWithQuotation(projectId);
    res.status(200).json({ data });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};