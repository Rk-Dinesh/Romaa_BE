import RateAnalysisQuantitiesService from "./rateanalysisquantities.service.js";

export const getRateAnalysisQuantities = async (req, res) => {
    try {
        const rateAnalysisQuantities = await RateAnalysisQuantitiesService.getRateAnalysisQuantities(req.params.tender_id, req.params.nametype);
        res.status(200).json({ status: true, data: rateAnalysisQuantities });
    } catch (error) {
        const statusCode = error.message.includes("Invalid resource category") ? 400
            : error.message.includes("not found") ? 404
            : 500;
        res.status(statusCode).json({ status: false, message: error.message });
    }
};

export const getRateAnalysisQuantitiesAllowed = async (req, res) => {
    try {
        const rateAnalysisQuantities = await RateAnalysisQuantitiesService.getRateAnalysisQuantitiesAllowed(req.params.tender_id, req.params.nametype);
        res.status(200).json({ status: true, data: rateAnalysisQuantities });
    } catch (error) {
        const statusCode = error.message.includes("Invalid resource category") ? 400
            : error.message.includes("not found") ? 404
            : 500;
        res.status(statusCode).json({ status: false, message: error.message });
    }
};

export const updateRateAnalysisQuantities = async (req, res) => {
    try {
        const rateAnalysisQuantities = await RateAnalysisQuantitiesService.updateRateAnalysisQuantities(req.params.tender_id, req.params.nametype, req.body);
        res.status(200).json({ status: true, message: "Rate analysis quantities updated successfully.", data: rateAnalysisQuantities });
    } catch (error) {
        const statusCode = error.message.includes("Invalid resource category") ? 400
            : error.message.includes("not found") ? 404
            : 500;
        res.status(statusCode).json({ status: false, message: error.message });
    }
};