import DetailedEstimateModel from "./detailedestimate.model.js";
import fs from "fs";
import csvParser from "csv-parser";


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

static async bulkInsertCustomHeadings(tender_id, nametype, filePath) {
  if (!tender_id) throw new Error("tender_id is required");
  if (!filePath) throw new Error("CSV file path is required");

  // Validate nametype ends with either 'abstract' or 'detailed'
  const match = nametype.match(/^(.*)(abstract|detailed)$/i);
  if (!match) throw new Error("nametype must end with 'abstract' or 'detailed'");
  
  const baseHeading = match[1];      // e.g. "kasitest1"
  const type = match[2].toLowerCase();  // "abstract" or "detailed"
  const key = nametype.toLowerCase();   // full key e.g. kasitest1abstract

  const dataArray = [];  // Collect all rows from CSV here

  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => {
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
      })
      .on("end", resolve)
      .on("error", reject);
  });

  const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
  if (!detailedEstimate) throw new Error("Detailed estimate not found for this tender_id");

  if (detailedEstimate.detailed_estimate.length === 0) {
    detailedEstimate.detailed_estimate.push({ customheadings: [] });
  }
  const estimate = detailedEstimate.detailed_estimate[0];
  if (!estimate.customheadings) estimate.customheadings = [];

  // Find or create heading object by baseHeading
  let headingObj = estimate.customheadings.find(h => h.heading === baseHeading);
  if (!headingObj) {
    headingObj = { heading: baseHeading };
    estimate.customheadings.push(headingObj);
  }

  if (!headingObj[key]) headingObj[key] = [];
  headingObj[key].push(...dataArray);

  await detailedEstimate.save();
  return detailedEstimate;
}


}

export default detailedestimateService;




