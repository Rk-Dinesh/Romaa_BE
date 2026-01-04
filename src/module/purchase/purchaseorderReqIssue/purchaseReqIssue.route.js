import { Router } from "express";
import { approveVendorQuotation, createPurchaseRequest, getAllByProjectIdSelectedVendorWithQuotation, getAllByNewRequest, getAllPurchaseByProjectId, getAllPurchaseBySelectedVendor, getPurchaseByProjectAndRequestId, getQuotationApproved, getQuotationRequested, getVendorQuotationByQuotationId, postVendorQuotationWithTenderCheck, updateStatus, getAllByQuotationRequested, rejectVendor, getAllByQuotationApproved, updateStatusRequest, getAllByMaterialReceived } from "./purchaseReqIssue.controller.js";

const purhcaseRequestrouter = Router();

purhcaseRequestrouter.post('/api/create', createPurchaseRequest   );
purhcaseRequestrouter.get('/api/getbyId/:projectId', getAllPurchaseByProjectId);

purhcaseRequestrouter.get('/api/getbyIdNewRequest', getAllByNewRequest);
purhcaseRequestrouter.get('/api/getbyIdQuotationRequested', getAllByQuotationRequested);
purhcaseRequestrouter.get('/api/getbyIdQuotationApproved', getAllByQuotationApproved);
purhcaseRequestrouter.get('/api/getbyIdMaterialReceived/:projectId', getAllByMaterialReceived); //for material received

purhcaseRequestrouter.get('/api/getdetailbyId/:projectId/:requestId', getPurchaseByProjectAndRequestId);
purhcaseRequestrouter.get('/api/getslectedvendor/:projectId', getAllPurchaseBySelectedVendor);
purhcaseRequestrouter.post('/api/purchase-requests/:purchaseRequestId/vendor-quotation', postVendorQuotationWithTenderCheck);
purhcaseRequestrouter.get('/api/vendor-quotations/:quotationId', getVendorQuotationByQuotationId);

purhcaseRequestrouter.put('/api/purchase-requests/:purchaseRequestId/approve-vendor', approveVendorQuotation);
purhcaseRequestrouter.put('/api/purchase-requests/:purchaseRequestId/reject-vendor', rejectVendor);

purhcaseRequestrouter.get('/api/purchase-requests/project/:projectId/selected-vendor', getAllByProjectIdSelectedVendorWithQuotation);

purhcaseRequestrouter.put('/api/updateStatus/:requestId', updateStatus);
purhcaseRequestrouter.put('/api/pass_po/:requestId', updateStatusRequest); 

purhcaseRequestrouter.get('/api/getQuotationRequested/:projectId/:requestId', getQuotationRequested);

purhcaseRequestrouter.get('/api/getQuotationApproved/:requestId', getQuotationApproved);


export default purhcaseRequestrouter;
