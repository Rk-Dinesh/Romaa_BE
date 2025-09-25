import { Router } from 'express';
import multer from 'multer';
import {
  addWorkItem,
  getAllWorkItems,
  getWorkItemById,
  updateWorkItem,
  deleteWorkItem,
  uploadWorkItemsCSV1,
  getWorkItemsByTenderId,
  uploadWorkItemsCSVAndSyncBoq
} from './rateanalysis.controller.js';

const rateanalysisrouter = Router();
const upload = multer({ dest: "uploads/" });

rateanalysisrouter.post('/add', addWorkItem);
rateanalysisrouter.get('/all', getAllWorkItems);
rateanalysisrouter.get('/getbytenderId', getWorkItemsByTenderId);
rateanalysisrouter.get('getbyid/:id', getWorkItemById);
rateanalysisrouter.put('/update/:id', updateWorkItem);
rateanalysisrouter.delete('/delete/:id', deleteWorkItem);
rateanalysisrouter.post('/uploadcsv1', upload.single('file'), uploadWorkItemsCSV1);
rateanalysisrouter.post('/uploadcsv', upload.single('file'), uploadWorkItemsCSVAndSyncBoq);


export default rateanalysisrouter;
