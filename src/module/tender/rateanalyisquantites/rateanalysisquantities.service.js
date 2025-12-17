import WorkItemModel from "../rateAnalysis/rateanalysis.model.js";
import RAQuantityModel from "./rateanalysisquantities.model.js";

class RateAnalysisQuantitiesService {
  static async getRateAnalysisQuantities(tender_id, nametype) {
    const rateAnalysis = await WorkItemModel.findOne({ tender_id });
    const freeze = rateAnalysis.freeze;
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

    const docData = doc.quantites?.[nametype] || [];

    return {data:docData,freeze};
  }

  static async updateRateAnalysisQuantities(tender_id, nametype, data) {
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

    const itemData = data.items;

    // Calculate derived fields for each item
    const processedData = itemData.map((item) => {
      const quantityTotal = item.total_item_quantity || 0;
      const rate = item.unit_rate || 0;
      const taxPercent = item.tax_percent || 0;
      const escalationPercent = item.escalation_percent || 0;

      const taxAmount = (rate * quantityTotal * taxPercent) / 100;
      const escalationAmount = (rate * quantityTotal * escalationPercent) / 100;
      const totalAmount = rate * quantityTotal;
      const finalAmount = totalAmount + taxAmount + escalationAmount;

      return {
        ...item,
        tax_amount: Number(taxAmount.toFixed(2)),
        escalation_amount: Number(escalationAmount.toFixed(2)),
        total_amount: Number(totalAmount.toFixed(2)),
        final_amount: Number(finalAmount.toFixed(2)),
      };
    });

    const doc = await RAQuantityModel.findOne({ tender_id });

    if (!doc) {
      return await RAQuantityModel.create({
        tender_id,
        quantites: {
          [nametype]: processedData,
        },
      });
    }

    doc.quantites[nametype] = processedData;
    return await doc.save();
  }

}

export default RateAnalysisQuantitiesService