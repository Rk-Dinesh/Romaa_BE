import { Router } from 'express';
import { getRateAnalysisQuantities, updateRateAnalysisQuantities } from './rateanalysisquantities.controller.js';

const rateanalysisquantitesrouter = Router();

rateanalysisquantitesrouter.get('/quantites/:tender_id/:nametype', getRateAnalysisQuantities);
rateanalysisquantitesrouter.put('/quantites/update/:tender_id/:nametype', updateRateAnalysisQuantities);




export default rateanalysisquantitesrouter;
