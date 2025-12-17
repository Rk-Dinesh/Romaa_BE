import RateAnalysisQuantitiesService from "./rateanalysisquantities.service.js";

export const getRateAnalysisQuantities = async (req, res) => {
    try {
        const rateAnalysisQuantities = await RateAnalysisQuantitiesService.getRateAnalysisQuantities(req.params.tender_id, req.params.nametype);
        res.status(200).json(rateAnalysisQuantities);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};  

export const updateRateAnalysisQuantities = async (req, res) => {
    try {
        const rateAnalysisQuantities = await RateAnalysisQuantitiesService.updateRateAnalysisQuantities(req.params.tender_id, req.params.nametype, req.body);
        res.status(200).json(rateAnalysisQuantities);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};  