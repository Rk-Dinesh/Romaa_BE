import { Router } from "express";
import { approveVendorQuotation, createPurchaseRequest, getAllByProjectIdSelectedVendorWithQuotation, getAllPurchaseByProjectId, getAllPurchaseBySelectedVendor, getPurchaseByProjectAndRequestId, getQuotationRequested, getVendorQuotationByQuotationId, postVendorQuotationWithTenderCheck, updateStatus } from "./purchaseReqIssue.controller.js";

const purhcaseRequestrouter = Router();

purhcaseRequestrouter.post('/api/create', createPurchaseRequest   );
purhcaseRequestrouter.get('/api/getbyId/:projectId', getAllPurchaseByProjectId);
purhcaseRequestrouter.get('/api/getdetailbyId/:projectId/:requestId', getPurchaseByProjectAndRequestId);
purhcaseRequestrouter.get('/api/getslectedvendor/:projectId', getAllPurchaseBySelectedVendor);
purhcaseRequestrouter.post('/api/purchase-requests/:purchaseRequestId/vendor-quotation', postVendorQuotationWithTenderCheck);
purhcaseRequestrouter.get('/api/vendor-quotations/:quotationId', getVendorQuotationByQuotationId);
purhcaseRequestrouter.put('/api/purchase-requests/:purchaseRequestId/approve-vendor', approveVendorQuotation);
purhcaseRequestrouter.get('/api/purchase-requests/project/:projectId/selected-vendor', getAllByProjectIdSelectedVendorWithQuotation);
purhcaseRequestrouter.put('/api/updateStatus/:requestId', updateStatus);
purhcaseRequestrouter.get('/api/getQuotationRequested', getQuotationRequested);


export default purhcaseRequestrouter;
