import { Router } from 'express';
import multer from 'multer';
import {
  addWorkItem,
  getAllWorkItems,
  getWorkItemById,
  updateWorkItem,
  deleteWorkItem,
  uploadWorkItemsCSV
} from './rateanalysis.controller.js';

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post('/add', addWorkItem);
router.get('/all', getAllWorkItems);
router.get('/:id', getWorkItemById);
router.put('/update/:id', updateWorkItem);
router.delete('/delete/:id', deleteWorkItem);
router.post('/uploadcsv', upload.single('file'), uploadWorkItemsCSV);

export default router;
