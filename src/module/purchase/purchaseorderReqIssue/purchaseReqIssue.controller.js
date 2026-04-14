import PurchaseRequestService from "./purchaseReqIssue.service.js";



export const createPurchaseRequest = async (req, res) => {
  try {
    const result = await PurchaseRequestService.create(req.body);
    res.status(201).json({ status: true, message: 'Purchase order request created successfully', data: result });
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ status: false, message: error.message });
    }
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getPurchaseByProjectAndRequestId = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const purchase = await PurchaseRequestService.getByProjectAndRequestId(projectId, requestId);

    if (!purchase) {
      return res.status(404).json({ status: false, message: 'Purchase order request not found' });
    }
    res.status(200).json({ status: true, data: purchase });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllPurchaseByProjectId = async (req, res) => {
  try {
    const { projectId } = req.params;
    const purchase = await PurchaseRequestService.getAllByProjectIdWithFields(projectId);
    res.status(200).json({ status: true, data: purchase });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllByMaterialReceived = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { page, limit, search, fromdate, todate } = req.query;
    const result = await PurchaseRequestService.getAllByProjectIdForMaterialReceived(
      projectId,
      { page, limit, search, fromdate, todate }
    );
    res.status(200).json({
      status: true,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      totalCount: result.totalCount,
      data: result.data,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

const _respondPaginated = (res, result) =>
  res.status(200).json({
    status: true,
    currentPage: result.currentPage,
    totalPages: result.totalPages,
    totalCount: result.totalCount,
    data: result.data,
  });

export const getAllByNewRequest = async (req, res) => {
  try {
    const { page, limit, search, fromdate, todate } = req.query;
    const result = await PurchaseRequestService.getAllByNewRequest({ page, limit, search, fromdate, todate });
    _respondPaginated(res, result);
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllByQuotationRequested = async (req, res) => {
  try {
    const { page, limit, search, fromdate, todate } = req.query;
    const result = await PurchaseRequestService.getAllByQuotationRequested({ page, limit, search, fromdate, todate });
    _respondPaginated(res, result);
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllByQuotationApproved = async (req, res) => {
  try {
    const { page, limit, search, fromdate, todate } = req.query;
    const result = await PurchaseRequestService.getAllByQuotationApproved({ page, limit, search, fromdate, todate });
    _respondPaginated(res, result);
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllPurchaseBySelectedVendor = async (req, res) => {
  try {
    const { projectId } = req.params;
    const purchase = await PurchaseRequestService.getAllByProjectIdSelectedVendor(projectId);
    res.status(200).json({ status: true, data: purchase });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const postVendorQuotationWithTenderCheck = async (req, res) => {
  try {
    const { purchaseRequestId } = req.params;
    const { vendorId, tenderId, quoteItems, ...rest } = req.body;

    if (!vendorId) return res.status(400).json({ status: false, message: 'Vendor ID is required' });
    if (!tenderId) return res.status(400).json({ status: false, message: 'Tender ID is required' });
    if (!Array.isArray(quoteItems) || quoteItems.length === 0)
      return res.status(400).json({ status: false, message: 'At least one quote item is required' });

    const updatedPurchaseRequest = await PurchaseRequestService.addVendorQuotationWithTenderCheck({
      purchaseRequestId,
      vendorId,
      quoteData: { quoteItems, ...rest },
      tenderId
    });

    res.status(201).json({
      status: true,
      message: 'Vendor quotation added to purchase order request successfully',
      data: updatedPurchaseRequest,
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ status: false, message: error.message });
    }
    if (error.message.includes("not in the permitted") || error.message.includes("already approved")) {
      return res.status(409).json({ status: false, message: error.message });
    }
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getVendorQuotationByQuotationId = async (req, res) => {
  try {
    const { quotationId } = req.params;
    const doc = await PurchaseRequestService.getVendorQuotationByQuotationId(quotationId);

    if (!doc || !doc.vendorQuotations || doc.vendorQuotations.length === 0) {
      return res.status(404).json({ status: false, message: 'Vendor quotation not found' });
    }
    // Return only the matched vendor quotation details
    res.status(200).json({ status: true, data: doc.vendorQuotations[0] });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const approveVendorQuotation = async (req, res) => {
  try {
    const { purchaseRequestId } = req.params;
    const { quotationId } = req.body;

    if (!quotationId) return res.status(400).json({ status: false, message: 'Quotation ID is required' });

    const updatedPurchaseRequest = await PurchaseRequestService.approveVendorQuotation({
      purchaseRequestId,
      quotationId,
    });

    res.status(200).json({
      status: true,
      message: 'Vendor quotation approved and purchase order updated',
      data: updatedPurchaseRequest,
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ status: false, message: error.message });
    }
    res.status(400).json({ status: false, message: error.message });
  }
};

export const rejectVendor = async (req, res) => {
  try {
    const { purchaseRequestId } = req.params;
    const { quotationId } = req.body;

    if (!purchaseRequestId || !quotationId) {
      return res.status(400).json({ status: false, message: "Purchase request ID and quotation ID are required" });
    }

    const result = await PurchaseRequestService.rejectVendorQuotation({
      purchaseRequestId,
      quotationId,
    });

    res.status(200).json({
      status: true,
      message: "Vendor quotation rejected successfully",
      data: result,
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ status: false, message: error.message });
    }
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllByProjectIdSelectedVendorWithQuotation = async (req, res) => {
  try {
    const { projectId } = req.params;
    const data = await PurchaseRequestService.getAllByProjectIdSelectedVendorWithQuotation(projectId);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    // Extract status and permittedVendor from body
    const { status, permittedVendor,materialsRequired } = req.body;

    const result = await PurchaseRequestService.updateStatus(
      requestId,
      status,
      permittedVendor,
      materialsRequired
    );

    res.status(200).json({
      status: true,
      message: "Purchase order request status and vendors updated successfully",
      data: result,
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ status: false, message: error.message });
    }
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateStatusRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    const result = await PurchaseRequestService.updateStatusRequest(requestId, status);

    res.status(200).json({
      status: true,
      message: "Purchase order request status updated successfully",
      data: result,
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ status: false, message: error.message });
    }
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /getQuotationRequested
export const getQuotationRequested = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const requests = await PurchaseRequestService.getQuotationRequested(projectId, requestId);
    res.status(200).json({ status: true, data: requests });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getQuotationApproved = async (req, res) => {
  try {
    const { requestId } = req.params;
    const requests = await PurchaseRequestService.getRequestWithApprovedQuotation(requestId);
    res.status(200).json({ status: true, data: requests });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
