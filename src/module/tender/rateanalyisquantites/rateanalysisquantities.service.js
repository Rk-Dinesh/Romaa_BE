import RAQuantityModel from "./rateanalysisquantities.model.js";

class RateAnalysisQuantitiesService {
   static async getRateAnalysisQuantities(tender_id, nametype) {
  const allowed = [
    "consumable_material",
    "bulk_material",
    "machinery",
    "fuel",
    "contractor",
    "nmr",
  ];

  if (!allowed.includes(nametype)) {
    throw new Error(`Invalid nametype: ${nametype}`);
  }

  const doc = await RAQuantityModel.findOne(
    { tender_id },
    { quantites: 1, _id: 0 }
  );

  if (!doc) return [];

  return doc.quantites?.[nametype] || [];
}

}

export default RateAnalysisQuantitiesService