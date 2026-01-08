import { Router } from 'express';
import { getRateAnalysisQuantities, getRateAnalysisQuantitiesAllowed, updateRateAnalysisQuantities } from './rateanalysisquantities.controller.js';

const rateanalysisquantitesrouter = Router();

rateanalysisquantitesrouter.get('/quantites/:tender_id/:nametype', getRateAnalysisQuantities);
rateanalysisquantitesrouter.get('/quantites/allowed/:tender_id/:nametype', getRateAnalysisQuantitiesAllowed);
rateanalysisquantitesrouter.put('/quantites/update/:tender_id/:nametype', updateRateAnalysisQuantities);




export default rateanalysisquantitesrouter;
