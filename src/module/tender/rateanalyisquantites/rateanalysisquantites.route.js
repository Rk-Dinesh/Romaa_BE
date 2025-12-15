import { Router } from 'express';
import { getRateAnalysisQuantities } from './rateanalysisquantities.controller.js';

const rateanalysisquantitesrouter = Router();

rateanalysisquantitesrouter.get('/getbytenderId', getRateAnalysisQuantities);




export default rateanalysisquantitesrouter;
