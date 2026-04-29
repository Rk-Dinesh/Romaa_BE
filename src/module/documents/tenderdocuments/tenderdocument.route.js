import express from 'express';
import multer from 'multer';
import { verifyJWT } from "../../../common/Auth.middlware.js";
import { getDocumentByTenderIdAndCode, getDocumentByTenderIdAndCodeaws, getTenderDocument, uploadDocument, uploadMultipleDocuments } from './tenderdocument.controller.js';

// Use multer memory storage (so file is available in req.file.buffer)
const upload = multer({ storage: multer.memoryStorage() });

const tenderDocRouter = express.Router();
tenderDocRouter.use(verifyJWT);

// POST route for uploading a document
tenderDocRouter.post('/upload', upload.single('file'), uploadDocument);
tenderDocRouter.post('/upload-multiple', upload.array('file'), uploadMultipleDocuments);
tenderDocRouter.get('/alldocuments/:tender_id', getTenderDocument);
tenderDocRouter.get('/uniquedocument/:tender_id/:code', getDocumentByTenderIdAndCode);
tenderDocRouter.get('/uniquedocumentaws/:tender_id/:code', getDocumentByTenderIdAndCodeaws);

export default tenderDocRouter;
