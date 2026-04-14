import { Router } from 'express';
import multer from 'multer';
import { verifyJWT } from '../../../common/Auth.middlware.js';
import {
  addWorkItem,
  getAllWorkItems,
  getWorkItemById,
  updateWorkItem,
  deleteWorkItem,
  getWorkItemsByTenderId,
  uploadWorkItemsCSVAndSyncBoq,
  updateRateAnalysis,
  freezeRateAnalysis,
  getSummary
} from './rateanalysis.controller.js';

const rateanalysisrouter = Router();
const upload = multer({ dest: "uploads/" });

rateanalysisrouter.post('/add', verifyJWT, addWorkItem);
rateanalysisrouter.get('/all', verifyJWT, getAllWorkItems);
rateanalysisrouter.get('/getbytenderId', verifyJWT, getWorkItemsByTenderId);
rateanalysisrouter.get('/getbyid/:id', verifyJWT, getWorkItemById);
rateanalysisrouter.put('/update/:id', verifyJWT, updateWorkItem);
rateanalysisrouter.delete('/delete/:id', verifyJWT, deleteWorkItem);
rateanalysisrouter.post('/uploadcsv', verifyJWT, upload.single('file'), uploadWorkItemsCSVAndSyncBoq);
rateanalysisrouter.put('/updaterateanalysis/:tender_id', verifyJWT, updateRateAnalysis);
rateanalysisrouter.put('/freeze/:tender_id', verifyJWT, freezeRateAnalysis);
rateanalysisrouter.get('/getsummary/:tender_id', verifyJWT, getSummary);

export default rateanalysisrouter;
