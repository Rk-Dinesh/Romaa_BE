import { Router } from "express";
import { 
  createWorkDone,
  getAllWorkDoneByTender,
  getWorkDoneSpecific 
} from "./workdone.controller.js";

const workDoneRouter = Router();

workDoneRouter.post('/api/create', createWorkDone);
workDoneRouter.get('/api/list/:tender_id', getAllWorkDoneByTender);
workDoneRouter.get('/api/details/:tender_id/:workDoneId', getWorkDoneSpecific);

export default workDoneRouter;