import DetailedEstimateModel from "./detailedestimate.model.js";
import fs from "fs";
import csvParser from "csv-parser";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


class detailedestimateService {
static async createDetailedEstimateCustomHeadings({tender_id},{  heading, abstract = [], detailed = [] }) {
  const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
  if (!detailedEstimate) {
    throw new Error("Detailed estimate not found for this tender_id");
  }

  if (detailedEstimate.detailed_estimate.length === 0) {
    detailedEstimate.detailed_estimate.push({ customheadings: [] });
  }

  const headingKeyPrefix = heading.toLowerCase();

  // Create dynamic keys for abstract and detailed arrays
  const newHeading = {
    heading,
    [`${headingKeyPrefix}abstract`]: abstract,
    [`${headingKeyPrefix}detailed`]: detailed
  };

  detailedEstimate.detailed_estimate[0].customheadings.push(newHeading);

  await detailedEstimate.save();
  return detailedEstimate;
}

static async extractHeadingsInPairs({tender_id}) {
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate) {
      throw new Error("Detailed estimate not found for this tender_id");
    }
  
    if (detailedEstimate.detailed_estimate.length === 0) {
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
  // Same logic as before, but with csvRows array passed directly
  if (!tender_id) throw new Error("tender_id is required");

  const match = nametype.match(/^(.*)(abstract|detailed)$/i);
  if (!match) throw new Error("nametype must end with 'abstract' or 'detailed'");

  const baseHeading = match[1].toLowerCase();
  const type = match[2].toLowerCase();
  const key = nametype.toLowerCase();

  const dataArray = [];
  
  for (const row of csvRows) {
    if (type === "abstract") {
      dataArray.push({
        description: row.description,
        unit: row.unit || "",
        quantity: Number(row.quantity) || 0,
        rate: Number(row.rate) || 0,
        amount: Number(row.amount) || 0,
      });
    } else if (type === "detailed") {
      dataArray.push({
        description: row.description,
        number: Number(row.number) || 0,
        length: Number(row.length) || 0,
        breath: Number(row.breath) || 0,
        depth: Number(row.depth) || 0,
        contents: Number(row.contents) || 0,
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
  return  detailedEstimate;
}

static async  getCustomHeadingsByTenderAndNameTypeService(tender_id, nametype) {
  if (!tender_id) throw new Error("tender_id is required");
  if (!nametype) throw new Error("nametype is required");

  const match = nametype.match(/^(.*)(abstract|detailed)$/i);
  if (!match) throw new Error("nametype must end with 'abstract' or 'detailed'");

  const baseHeading = match[1].toLowerCase();
  const key = nametype.toLowerCase();

  const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
  if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");

  if (!detailedEstimate.detailed_estimate.length) {
    throw new Error("No detailed estimates available");
  }

  const estimate = detailedEstimate.detailed_estimate[0];
  if (!estimate.customheadings || !estimate.customheadings.length) {
    throw new Error("No custom headings found");
  }

  const headingObj = estimate.customheadings.find(h => h.heading === baseHeading);
  if (!headingObj || !headingObj[key]) {
    throw new Error(`No data found for ${nametype}`);
  }

  return headingObj[key];
}
static async bulkInsert(tender_id, nametype, csvRows) {
  if (!tender_id) throw new Error("tender_id is required");
  if (!nametype) throw new Error("nametype is required");

  const baseHeading = nametype.toLowerCase();

  const dataArray = [];

  for (const row of csvRows) {
    if (!row.description || row.description.trim() === "") {
      // Skip rows missing description or handle error here
      console.warn("Skipping row missing description:", row);
      continue;
      // Or: throw new Error("All rows must have a description");
    }
    dataArray.push({
      description: row.description.trim(),
      unit: row.unit || "",
      quantity: Number(row.quantity) || 0,
      rate: Number(row.rate) || 0,
      amount: Number(row.amount) || 0,
    });
  }

  if (dataArray.length === 0) throw new Error("No valid rows to insert after validation");

  const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
  if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");

  if (detailedEstimate.detailed_estimate.length === 0) {
    detailedEstimate.detailed_estimate.push({
      generalabstract: [],
      billofqty: [],
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

static async  getHeadingsByTenderAndNameTypeService(tender_id, nametype) {
  if (!tender_id) throw new Error("tender_id is required");
  if (!nametype) throw new Error("nametype is required");


  const baseHeading = nametype.toLowerCase();

  const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
  if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");

  if (!detailedEstimate.detailed_estimate.length) {
    throw new Error("No detailed estimates available");
  }

  const estimate = detailedEstimate.detailed_estimate[0];
 
  const headingObj =estimate[baseHeading]; ;
  if (!headingObj ) {
    throw new Error(`No data found for ${nametype}`);
  }

  return headingObj;
}


}

export default detailedestimateService;




