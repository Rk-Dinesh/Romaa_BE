import PurchaseRequestService from "./purchaseReqIssue.service.js";



export const createPurchaseRequest = async (req, res) => {
  try {
    const result = await PurchaseRequestService.create(req.body);
    res.status(201).json({ message: 'PurchaseRequests created successfully', data: result });
  } catch (error) {
    res.status(400).json({ message: 'Error creating PurchaseRequests', error: error.message });
  }
};

export const getPurchaseByProjectAndRequestId = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const purchase = await PurchaseRequestService.getByProjectAndRequestId(projectId, requestId);

    if (!purchase) {
      return res.status(404).json({ message: 'PurchaseRequests not found' });
    }
    res.status(200).json({ data: purchase });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching PurchaseRequests', error: error.message });
  }
};

export const getAllPurchaseByProjectId = async (req, res) => {
  try {
    const { projectId } = req.params;
    const purchase = await PurchaseRequestService.getAllByProjectIdWithFields(projectId);
    res.status(200).json({ data: purchase });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching PurchaseRequests', error: error.message });
  }
};

export const getAllByNewRequest = async (req, res) => {
  try {
    const purchase = await PurchaseRequestService.getAllByNewRequest();
    res.status(200).json({ data: purchase });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching PurchaseRequests', error: error.message });
  }
};

export const getAllByQuotationRequested = async (req, res) => {
  try {
    const purchase = await PurchaseRequestService.getAllByQuotationRequested();
    res.status(200).json({ data: purchase });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching PurchaseRequests', error: error.message });
  }
};

export const getAllByQuotationApproved = async (req, res) => {
  try {
    const purchase = await PurchaseRequestService.getAllByQuotationApproved();
    res.status(200).json({ data: purchase });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching PurchaseRequests', error: error.message });
  }
};

export const getAllPurchaseBySelectedVendor = async (req, res) => {
  try {
    const { projectId } = req.params;
    const purchase = await PurchaseRequestService.getAllByProjectIdSelectedVendor(projectId);
    res.status(200).json({ data: purchase });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching PurchaseRequests', error: error.message });
  }
};

export const postVendorQuotationWithTenderCheck = async (req, res) => {
  try {
    const { purchaseRequestId } = req.params;
    const { vendorId, tenderId, quoteItems, ...rest } = req.body;

    if (!vendorId) return res.status(400).json({ message: 'vendorId is required' });
    if (!tenderId) return res.status(400).json({ message: 'tenderId is required' });
    if (!Array.isArray(quoteItems) || quoteItems.length === 0)
      return res.status(400).json({ message: 'quoteItems are required' });

    const updatedPurchaseRequest = await PurchaseRequestService.addVendorQuotationWithTenderCheck({
      purchaseRequestId,
      vendorId,
      quoteData: { quoteItems, ...rest },
      tenderId
    });

    res.status(201).json({
      message: 'Vendor quotation added successfully',
      data: updatedPurchaseRequest,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getVendorQuotationByQuotationId = async (req, res) => {
  try {
    const { quotationId } = req.params;
    const doc = await PurchaseRequestService.getVendorQuotationByQuotationId(quotationId);

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
    const { purchaseRequestId } = req.params;
    const { quotationId } = req.body;

    if (!quotationId) return res.status(400).json({ message: 'quotationId is required' });

    const updatedPurchaseRequest = await PurchaseRequestService.approveVendorQuotation({
      purchaseRequestId,
      quotationId,
    });

    res.status(200).json({
      message: 'Vendor quotation approved and selectedVendor updated.',
      data: updatedPurchaseRequest,
      success: true,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const rejectVendor = async (req, res) => {
  try {
    const { purchaseRequestId } = req.params; 
    const { quotationId } = req.body;

    if (!purchaseRequestId || !quotationId) {
      return res.status(400).json({ success: false, message: "IDs required" });
    }

    const result = await PurchaseRequestService.rejectVendorQuotation({
      purchaseRequestId,
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

export const getAllByProjectIdSelectedVendorWithQuotation = async (req, res) => {
  try {
    const { projectId } = req.params;
    const data = await PurchaseRequestService.getAllByProjectIdSelectedVendorWithQuotation(projectId);
    res.status(200).json({ data });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    // Extract status and permittedVendor from body
    const { status, permittedVendor } = req.body; 

    const result = await PurchaseRequestService.updateStatus(
      requestId, 
      status, 
      permittedVendor
    );

    res.status(200).json({
      success: true,
      message: "Status and Vendors updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateStatusRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    const result = await PurchaseRequestService.updateStatusRequest(requestId, status);

    res.status(200).json({
      success: true,
      message: "Status updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /getQuotationRequested
export const getQuotationRequested = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const requests = await PurchaseRequestService.getQuotationRequested(projectId, requestId);
    res.json({ data: requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getQuotationApproved = async (req, res) => {
  try {
    const { requestId } = req.params;
    const requests = await PurchaseRequestService.getRequestWithApprovedQuotation(requestId);
    res.json({ data: requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};