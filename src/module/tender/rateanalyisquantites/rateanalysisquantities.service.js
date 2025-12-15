import RAQuantityModel from "./rateanalysisquantities.model.js";

class RateAnalysisQuantitiesService {
    static async getRateAnalysisQuantities(tender_id) {
        return await RAQuantityModel.find({ tender_id });
    }
}

export default RateAnalysisQuantitiesService