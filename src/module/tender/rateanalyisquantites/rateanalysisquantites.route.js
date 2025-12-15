import { Router } from 'express';
import { getRateAnalysisQuantities } from './rateanalysisquantities.controller.js';

const rateanalysisquantitesrouter = Router();

rateanalysisquantitesrouter.get('/quantites/:tender_id/:nametype', getRateAnalysisQuantities);




export default rateanalysisquantitesrouter;
