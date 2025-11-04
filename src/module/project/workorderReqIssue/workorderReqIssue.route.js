import { Router } from "express";
import { createWorkOrderRequest, getAllWorkOrdersByProjectId, getAllWorkOrdersBySelectedVendor, getWorkOrderByProjectAndRequestId } from "./workorderReqIssue.controller.js";

const workOrderRequestrouter = Router();

workOrderRequestrouter.post('/api/create', createWorkOrderRequest   );
workOrderRequestrouter.get('/api/getbyId/:projectId', getAllWorkOrdersByProjectId);
workOrderRequestrouter.get('/api/getdetailbyId/:tenderId/:requestId', getWorkOrderByProjectAndRequestId);
workOrderRequestrouter.get('/api/getslectedvendor/:projectId', getAllWorkOrdersBySelectedVendor);




export default workOrderRequestrouter;
