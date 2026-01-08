import { Router } from "express";
import { createWorkOrderRequest, getAllByNewRequest, getQuotationRequested, approveVendorQuotation, rejectVendor, postVendorQuotationWithTenderCheck, getWorkOrderByProjectAndRequestId, getQuotationApproved, getAllByQuotationApproved, getAllByWorkOrderIssuedForWorkDone, getAllByWorkOrderIssuedForWorkDoneMaterial, updateStatusRequest } from "./workorderReqIssue.controller.js";

const workOrderRequestrouter = Router();

workOrderRequestrouter.post('/api/create', createWorkOrderRequest   );
workOrderRequestrouter.get('/api/getbyIdNewRequest/:projectId', getAllByNewRequest);
workOrderRequestrouter.get('/api/getQuotationRequested/:projectId/:requestId', getQuotationRequested);
workOrderRequestrouter.get('/api/getbyIdQuotationApproved/:projectId', getAllByQuotationApproved);
workOrderRequestrouter.put('/api/workorder-requests/:workOrderId/approve-vendor', approveVendorQuotation);
workOrderRequestrouter.put('/api/workorder-requests/:workOrderId/reject-vendor', rejectVendor);
workOrderRequestrouter.post('/api/workorder-requests/:workOrderId/vendor-quotation', postVendorQuotationWithTenderCheck);
workOrderRequestrouter.get('/api/getdetailbyId/:projectId/:requestId', getWorkOrderByProjectAndRequestId);
workOrderRequestrouter.get('/api/getQuotationApproved/:requestId', getQuotationApproved);
workOrderRequestrouter.get('/api/getWorkOrderIssuedForWorkDone/:projectId', getAllByWorkOrderIssuedForWorkDone);
workOrderRequestrouter.get('/api/getWorkOrderIssuedForWorkDoneMaterial/:projectId/:requestId', getAllByWorkOrderIssuedForWorkDoneMaterial);
workOrderRequestrouter.put('/api/pass_wo/:requestId', updateStatusRequest); 



export default workOrderRequestrouter;
