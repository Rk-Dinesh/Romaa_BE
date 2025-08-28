import express from 'express';
import multer from 'multer';
import { uploadDocument } from './tenderdocument.controller.js';

// Use multer memory storage (so file is available in req.file.buffer)
const upload = multer({ storage: multer.memoryStorage() });

const tenderDocRouter = express.Router();

// POST route for uploading a document
tenderDocRouter.post('/upload', upload.single('file'), uploadDocument);

export default tenderDocRouter;
