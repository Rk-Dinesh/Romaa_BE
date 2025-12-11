import DetailedEstimateModel from "./detailedestimate.model.js";

class detailedestimateService {
  static async createDetailedEstimateCustomHeadings({ tender_id }, { heading, abstract = [], detailed = [] }) {
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate) {
      throw new Error("Detailed estimate not found for this tender_id");
    }

    if (detailedEstimate.detailed_estimate.length === 0) {
      detailedEstimate.detailed_estimate.push({ customheadings: [] });
    }

    const headingKeyPrefix = heading.toLowerCase();
    const newHeading = {
      heading,
      [`${headingKeyPrefix}abstract`]: abstract,
      [`${headingKeyPrefix}detailed`]: detailed
    };

    detailedEstimate.detailed_estimate[0].customheadings.push(newHeading);
    await detailedEstimate.save();
    return detailedEstimate;
  }

  static async extractHeadingsInPairs({ tender_id }) {
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate || detailedEstimate.detailed_estimate.length === 0) {
      return [];
    }

    const customHeadings = detailedEstimate.detailed_estimate[0].customheadings;
    const headingPairs = customHeadings.map(headingObj => {
      const heading = headingObj.heading;
      const keyPrefix = heading.toLowerCase();
      return {
        heading,
        abstractKey: `${keyPrefix}abstract`,
        detailedKey: `${keyPrefix}detailed`
      };
    });

    return headingPairs;
  }

static async bulkInsertCustomHeadingsFromCsv(tender_id, nametype, csvRows) {
  if (!tender_id) throw new Error("tender_id is required");
  const match = nametype.match(/^(.*)(abstract|detailed)$/i);
  if (!match) throw new Error("nametype must end with 'abstract' or 'detailed'");

  const baseHeading = match[1].toLowerCase();
  const type = match[2].toLowerCase();
  const key = nametype.toLowerCase();

  const dataArray = [];
  if (type === "abstract") {
    for (const row of csvRows) {
      dataArray.push({
        abstract_id: row.abstract_id,
        description: row.description,
        unit: row.unit || "",
        quantity: Number(row.quantity) || 0,
        rate: Number(row.rate) || 0,
        amount: Number(row.amount) || 0,
        balance_quantity: Number(row.quantity) || 0,
        balance_amount: Number(row.amount) || 0,
        phase_breakdown: []
      });
    }
  } else if (type === "detailed") {
    // Group by abstract_id
    const grouped = {};
    for (const row of csvRows) {
      if (!grouped[row.abstract_id]) {
        grouped[row.abstract_id] = [];
      }
      grouped[row.abstract_id].push({
        particulars: row.particulars,
        nos: row.nos || "",
        l: Number(row.l) || 0,
        b: Number(row.b) || 0,
        d_h: Number(row.d_h) || 0,
        content: Number(row.content) || 0,
        balance_quantity: Number(row.content) || 0,
        phase_breakdown: []
      });
    }

    // Convert grouped object to dataArray
    for (const [abstract_id, breakdown] of Object.entries(grouped)) {
      dataArray.push({
        abstract_id,
        breakdown
      });
    }
  }

  const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
  if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");

  if (detailedEstimate.detailed_estimate.length === 0) {
    detailedEstimate.detailed_estimate.push({ customheadings: [] });
  }

  const estimate = detailedEstimate.detailed_estimate[0];
  if (!estimate.customheadings) estimate.customheadings = [];

  let headingObj = estimate.customheadings.find((h) => h.heading === baseHeading);
  if (!headingObj) {
    headingObj = { heading: baseHeading };
    estimate.customheadings.push(headingObj);
  }

  if (!headingObj[key]) headingObj[key] = [];
  headingObj[key].push(...dataArray);

  detailedEstimate.markModified('detailed_estimate');
  await detailedEstimate.save();
  return detailedEstimate;
}


static async getCustomHeadingsByTenderAndNameTypeService(tender_id, nametype) {
  if (!tender_id) throw new Error("tender_id is required");
  if (!nametype) throw new Error("nametype is required");

  const match = nametype.match(/^(.*)(abstract|detailed)$/i);
  if (!match) throw new Error("nametype must end with 'abstract' or 'detailed'");

  const baseHeading = match[1].toLowerCase();
  const key = nametype.toLowerCase();

  const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
  if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");
  if (!detailedEstimate.detailed_estimate.length) throw new Error("No detailed estimates available");

  const estimate = detailedEstimate.detailed_estimate[0];
  if (!estimate.customheadings || !estimate.customheadings.length) throw new Error("No custom headings found");

  const headingObj = estimate.customheadings.find(h => h.heading === baseHeading);
  if (!headingObj || !headingObj[key]) throw new Error(`No data found for ${nametype}`);

  // If it's detailed, enrich with abstract details
  if (key.includes("detailed")) {
    const abstractKey = `${baseHeading}abstract`;
    const abstracts = headingObj[abstractKey] || [];

    const enrichedData = headingObj[key].map(detailedItem => {
      const abstract = abstracts.find(a => a.abstract_id === detailedItem.abstract_id);
      return {
        ...detailedItem,
        abstract_details: abstract
          ? {
              description: abstract.description,
              quantity: abstract.quantity,
              rate: abstract.rate
            }
          : null
      };
    });

    return enrichedData;
  }

  return headingObj[key];
}


  static async bulkInsert(tender_id, nametype, csvRows) {
    if (!tender_id) throw new Error("tender_id is required");
    if (!nametype) throw new Error("nametype is required");

    const baseHeading = nametype.toLowerCase();
    const dataArray = [];

    for (const row of csvRows) {
      if (!row.description || row.description.trim() === "") continue;
      dataArray.push({
        description: row.description.trim(),
        unit: row.unit || "",
        quantity: Number(row.quantity) || 0,
        rate: Number(row.rate) || 0,
        amount: Number(row.amount) || 0
      });
    }

    if (dataArray.length === 0) throw new Error("No valid rows to insert after validation");

    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");

    if (detailedEstimate.detailed_estimate.length === 0) {
      detailedEstimate.detailed_estimate.push({
        generalabstract: [],
        billofqty: []
      });
    }

    const estimate = detailedEstimate.detailed_estimate[0];

    if (baseHeading === "generalabstract") {
      if (!estimate.generalabstract) estimate.generalabstract = [];
      estimate.generalabstract.push(...dataArray);
    } else if (baseHeading === "billofqty") {
      if (!estimate.billofqty) estimate.billofqty = [];
      estimate.billofqty.push(...dataArray);
    }

    detailedEstimate.markModified("detailed_estimate");
    await detailedEstimate.save();
    return detailedEstimate;
  }

  static async getHeadingsByTenderAndNameTypeService(tender_id, nametype) {
    if (!tender_id) throw new Error("tender_id is required");
    if (!nametype) throw new Error("nametype is required");

    const baseHeading = nametype.toLowerCase();
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");
    if (!detailedEstimate.detailed_estimate.length) throw new Error("No detailed estimates available");

    const estimate = detailedEstimate.detailed_estimate[0];
    const headingObj = estimate[baseHeading];
    if (!headingObj) throw new Error(`No data found for ${nametype}`);

    return headingObj;
  }

  static async addPhaseBreakdownToAbstractService(tender_id, nametype, description, phase, quantity) {
    if (!tender_id) throw new Error("tender_id is required");
    if (!nametype) throw new Error("nametype is required");
    if (!description) throw new Error("description is required");
    if (!phase) throw new Error("phase is required");
    if (typeof quantity !== "number" || quantity <= 0) throw new Error("Valid quantity required");

    const match = nametype.match(/^(.*)(abstract)$/i);
    if (!match) throw new Error("nametype must end with 'abstract'");

    const baseHeading = match[1].toLowerCase();
    const key = nametype.toLowerCase();

    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");
    if (!detailedEstimate.detailed_estimate.length) throw new Error("No detailed estimates available");

    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.customheadings || !estimate.customheadings.length) throw new Error("No custom headings found");

    const headingObj = estimate.customheadings.find(h => h.heading === baseHeading);
    if (!headingObj || !headingObj[key]) throw new Error(`No data found for ${nametype}`);

    const abstractIndex = headingObj[key].findIndex(item => item.description === description);
    if (abstractIndex === -1) throw new Error("Abstract item with given description not found");

    const abstractItem = headingObj[key][abstractIndex];
    const rate = abstractItem.rate;
    const totalQty = abstractItem.quantity;

    if (!rate) throw new Error("Rate not defined in abstract item");

    if (!Array.isArray(abstractItem.phase_breakdown)) abstractItem.phase_breakdown = [];

    let currentSum = abstractItem.phase_breakdown.reduce((acc, pb) => pb.phase !== phase ? acc + pb.quantity : acc, 0);
    let phaseEntry = abstractItem.phase_breakdown.find(pb => pb.phase === phase);

    if (phaseEntry) {
      if (currentSum + quantity > totalQty) {
        throw new Error(`Total allocated quantity (${currentSum + quantity}) exceeds available quantity (${totalQty})`);
      }
      phaseEntry.quantity = quantity;
      phaseEntry.amount = quantity * rate;
    } else {
      if (currentSum + quantity > totalQty) {
        throw new Error(`Total allocated quantity (${currentSum + quantity}) exceeds available quantity (${totalQty})`);
      }
      abstractItem.phase_breakdown.push({ phase, quantity, amount: quantity * rate });
    }

    const finalSum = abstractItem.phase_breakdown.reduce((acc, pb) => acc + pb.quantity, 0);
    const finalAmount = abstractItem.phase_breakdown.reduce((acc, pb) => acc + pb.amount, 0);
    abstractItem.balance_quantity = Math.max(totalQty - finalSum, 0);
    abstractItem.balance_amount = Math.max(abstractItem.amount - finalAmount, 0);

    const estimateIndex = 0;
    const customHeadingsIndex = estimate.customheadings.findIndex(h => h.heading === baseHeading);
    const path = `detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIndex}.${key}.${abstractIndex}.phase_breakdown`;
    detailedEstimate.markModified(path);
    detailedEstimate.markModified(`detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIndex}.${key}.${abstractIndex}.balance_quantity`);
    detailedEstimate.markModified(`detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIndex}.${key}.${abstractIndex}.balance_amount`);

    await detailedEstimate.save();
    return {
      phase_breakdown: abstractItem.phase_breakdown,
      balance_quantity: abstractItem.balance_quantity,
      balance_amount: abstractItem.balance_amount
    };
  }

  static async addPhaseBreakdownToDetailedService(tender_id, nametype, description, phase, quantity) {
    if (!tender_id) throw new Error("tender_id is required");
    if (!nametype) throw new Error("nametype is required");
    if (!description) throw new Error("description is required");
    if (!phase) throw new Error("phase is required");
    if (typeof quantity !== "number" || quantity <= 0) throw new Error("Valid quantity required");

    const match = nametype.match(/^(.*)(detailed)$/i);
    if (!match) throw new Error("nametype must end with 'detailed'");

    const baseHeading = match[1].toLowerCase();
    const key = nametype.toLowerCase();

    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");
    if (!detailedEstimate.detailed_estimate.length) throw new Error("No detailed estimates available");

    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.customheadings || !estimate.customheadings.length) throw new Error("No custom headings found");

    const headingObj = estimate.customheadings.find(h => h.heading === baseHeading);
    if (!headingObj || !headingObj[key]) throw new Error(`No data found for ${nametype}`);

    const detailedIndex = headingObj[key].findIndex(item => item.description === description);
    if (detailedIndex === -1) throw new Error("Detailed item with given description not found");

    const detailedItem = headingObj[key][detailedIndex];
    const totalContents = detailedItem.contents;

    if (!Array.isArray(detailedItem.phase_breakdown)) detailedItem.phase_breakdown = [];

    let currentSum = detailedItem.phase_breakdown.reduce((acc, pb) => pb.phase !== phase ? acc + pb.quantity : acc, 0);
    let phaseEntry = detailedItem.phase_breakdown.find(pb => pb.phase === phase);

    if (phaseEntry) {
      if (currentSum + quantity > totalContents) {
        throw new Error(`Total allocated content (${currentSum + quantity}) exceeds available content (${totalContents})`);
      }
      phaseEntry.quantity = quantity;
    } else {
      if (currentSum + quantity > totalContents) {
        throw new Error(`Total allocated content (${currentSum + quantity}) exceeds available content (${totalContents})`);
      }
      detailedItem.phase_breakdown.push({ phase, quantity });
    }

    const finalSum = detailedItem.phase_breakdown.reduce((acc, pb) => acc + pb.quantity, 0);
    detailedItem.balance_quantity = Math.max(totalContents - finalSum, 0);

    const estimateIndex = 0;
    const customHeadingsIdx = estimate.customheadings.findIndex(h => h.heading === baseHeading);
    const path = `detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIdx}.${key}.${detailedIndex}.phase_breakdown`;
    detailedEstimate.markModified(path);
    detailedEstimate.markModified(`detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIdx}.${key}.${detailedIndex}.balance_quantity`);

    await detailedEstimate.save();
    return {
      phase_breakdown: detailedItem.phase_breakdown,
      balance_quantity: detailedItem.balance_quantity
    };
  }
}

export default detailedestimateService;
