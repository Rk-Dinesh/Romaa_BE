import { Router } from 'express';
import multer from 'multer';
import {
  addWorkItem,
  getAllWorkItems,
  getWorkItemById,
  updateWorkItem,
  deleteWorkItem,
  uploadWorkItemsCSV1,
  getWorkItemsByTenderId
} from './rateanalysis.controller.js';

const rateanalysisrouter = Router();
const upload = multer({ dest: "uploads/" });

rateanalysisrouter.post('/add', addWorkItem);
rateanalysisrouter.get('/all', getAllWorkItems);
rateanalysisrouter.get('/:id', getWorkItemById);
rateanalysisrouter.get('/getbytender_id', getWorkItemsByTenderId);
rateanalysisrouter.put('/update/:id', updateWorkItem);
rateanalysisrouter.delete('/delete/:id', deleteWorkItem);
rateanalysisrouter.post('/uploadcsv', upload.single('file'), uploadWorkItemsCSV1);


export default rateanalysisrouter;
