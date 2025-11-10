import { Router } from "express";
import { approveVendorQuotation, createWorkOrderRequest, getAllByProjectIdSelectedVendorWithQuotation, getAllWorkOrdersByProjectId, getAllWorkOrdersBySelectedVendor, getVendorQuotationByQuotationId, getWorkOrderByProjectAndRequestId, postVendorQuotationWithTenderCheck } from "./workorderReqIssue.controller.js";

const workOrderRequestrouter = Router();

workOrderRequestrouter.post('/api/create', createWorkOrderRequest   );
workOrderRequestrouter.get('/api/getbyId/:projectId', getAllWorkOrdersByProjectId);
workOrderRequestrouter.get('/api/getdetailbyId/:projectId/:requestId', getWorkOrderByProjectAndRequestId);
workOrderRequestrouter.get('/api/getslectedvendor/:projectId', getAllWorkOrdersBySelectedVendor);
workOrderRequestrouter.post('/api/workorder-requests/:workOrderRequestId/vendor-quotation', postVendorQuotationWithTenderCheck);
workOrderRequestrouter.get('/api/vendor-quotations/:quotationId', getVendorQuotationByQuotationId);
workOrderRequestrouter.put('/api/workorder-requests/:workOrderRequestId/approve-vendor', approveVendorQuotation);
workOrderRequestrouter.get('/api/workorder-requests/project/:projectId/selected-vendor', getAllByProjectIdSelectedVendorWithQuotation);


export default workOrderRequestrouter;
