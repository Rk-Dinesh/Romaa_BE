import express from 'express';
import multer from 'multer';
import { getDocumentByTenderIdAndCode, getDocumentByTenderIdAndCodeaws, getTenderDocument, uploadDocument, uploadMultipleDocuments } from './SiteDrawing.controller.js';

// Use multer memory storage (so file is available in req.file.buffer)
const upload = multer({ storage: multer.memoryStorage() });

const SiteDrawingRouter = express.Router();

// POST route for uploading a document
SiteDrawingRouter.post('/upload', upload.single('file'), uploadDocument);
SiteDrawingRouter.post('/upload-multiple', upload.array('file'), uploadMultipleDocuments);
SiteDrawingRouter.get('/alldocuments/:tender_id', getTenderDocument);
SiteDrawingRouter.get('/uniquedocument/:tender_id/:code', getDocumentByTenderIdAndCode);
SiteDrawingRouter.get('/uniquedocumentaws/:tender_id/:code', getDocumentByTenderIdAndCodeaws);

export default SiteDrawingRouter;
