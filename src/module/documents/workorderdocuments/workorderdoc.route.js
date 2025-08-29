import express from 'express';
import multer from 'multer';
import { getDocumentByTenderIdAndCodeAndWorkOrder, getDocumentByTenderIdAndCodeAndWorkOrderaws, getWorkOrderDocument, uploadDocument, uploadMultipleDocuments } from './workorderdoc.controller.js';


// Use multer memory storage (so file is available in req.file.buffer)
const upload = multer({ storage: multer.memoryStorage() });

const workOrderDocRouter = express.Router();

// POST route for uploading a document
workOrderDocRouter.post('/upload', upload.single('file'), uploadDocument);
workOrderDocRouter.post('/upload-multiple', upload.array('file'), uploadMultipleDocuments);
workOrderDocRouter.get('/alldocuments/:tender_id/:workOrder_id', getWorkOrderDocument);
workOrderDocRouter.get('/uniquedocument/:tender_id/:workOrder_id/:code', getDocumentByTenderIdAndCodeAndWorkOrder);
workOrderDocRouter.get('/uniquedocumentaws/:tender_id/:workOrder_id/:code', getDocumentByTenderIdAndCodeAndWorkOrderaws);

export default workOrderDocRouter;
