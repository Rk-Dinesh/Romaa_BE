import BidModel from "../bid/bid.model.js";
import DetailedEstimateModel from "./detailedestimate.model.js";

class detailedestimateService {
  static async createDetailedEstimateCustomHeadings(
    { tender_id },
    { heading, abstract = [], detailed = [] },
  ) {
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    const bid = await BidModel.findOne({ tender_id });
    if (bid.freezed === false) {
      throw new Error("The Bid must be frozen before creating Detailed Estimate headings. Please freeze the Bid and retry.");
    }
    if (!detailedEstimate) {
      throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    }

    if (detailedEstimate.detailed_estimate.length === 0) {
      detailedEstimate.detailed_estimate.push({ customheadings: [] });
    }

    const headingKeyPrefix = heading.toLowerCase();

    // Check for duplicate heading
    const existingHeading = detailedEstimate.detailed_estimate[0].customheadings.find(
      (h) => h.heading.toLowerCase() === headingKeyPrefix
    );
    if (existingHeading) {
      throw new Error(`Heading '${heading}' already exists. Duplicate headings are not allowed.`);
    }

    const newHeading = {
      heading,
      [`${headingKeyPrefix}abstract`]: abstract,
      [`${headingKeyPrefix}detailed`]: detailed,
    };

    detailedEstimate.detailed_estimate[0].customheadings.push(newHeading);
    await detailedEstimate.save();
    return detailedEstimate;
  }

  static async extractHeadingsInPairs({ tender_id }) {
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate || detailedEstimate.detailed_estimate.length === 0) {
      return { headingPairs: [], is_freeze: false };
    }

    const customHeadings = detailedEstimate.detailed_estimate[0].customheadings;
    const headingPairs = customHeadings.map((headingObj) => {
      const heading = headingObj.heading;
      const keyPrefix = heading.toLowerCase();
      return {
        heading,
        abstractKey: `${keyPrefix}abstract`,
        detailedKey: `${keyPrefix}detailed`,
      };
    });

    return { headingPairs, is_freeze: detailedEstimate.is_freeze };
  }

  static async freezeDetailedEstimate({ tender_id, is_freeze }) {
    if (!tender_id) throw new Error("Tender ID is required.");
    const doc = await DetailedEstimateModel.findOneAndUpdate(
      { tender_id },
      { is_freeze },
      { new: true },
    );
    if (!doc) throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    return doc;
  }

  static async deleteHeading({ tender_id, heading }) {
    if (!tender_id) throw new Error("Tender ID is required.");
    if (!heading) throw new Error("Heading name is required.");
    const doc = await DetailedEstimateModel.findOneAndUpdate(
      { tender_id },
      { $pull: { "detailed_estimate.0.customheadings": { heading } } },
      { new: true },
    );
    if (!doc) throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    return doc;
  }

  static async bulkInsertCustomHeadingsFromCsv(tender_id, nametype, csvRows) {
    if (!tender_id) throw new Error("Tender ID is required.");
    const match = nametype.match(/^(.*)(abstract|detailed)$/i);
    if (!match)
      throw new Error("Invalid section type. The section identifier must end with 'abstract' or 'detailed'.");

    const baseHeading = match[1].toLowerCase();
    const type = match[2].toLowerCase();
    const key = nametype.toLowerCase();

    const dataArray = [];
    let totalAmount = 0;

    if (type === "abstract") {
      // Extract all abstract_ids from CSV
      const csvAbstractIds = csvRows.map((row) => row.abstract_id);

      // Find duplicates
      const seen = new Set();
      const duplicates = csvAbstractIds.filter((id) => {
        if (seen.has(id)) return true;
        seen.add(id);
        return false;
      });

      if (duplicates.length > 0) {
        throw new Error(
          `Duplicate Abstract IDs detected: ${[...new Set(duplicates)].join(", ")}. Each Abstract ID must be unique within the upload.`,
        );
      }

      // Fetch billOfQty item_ids
      const detailedEstimate = await DetailedEstimateModel.findOne({
        tender_id,
      });
      if (!detailedEstimate)
        throw new Error("Detailed Estimate record not found for the specified Tender ID.");

      const estimate = detailedEstimate.detailed_estimate[0];
      if (!estimate || !estimate.billofqty)
        throw new Error("Bill of Quantities not found in the Detailed Estimate.");

      const billOfQtyItemIds = new Set(
        estimate.billofqty.map((item) => item.item_id),
      );

      // Find missing IDs
      const missingIds = csvAbstractIds.filter(
        (id) => !billOfQtyItemIds.has(id),
      );
      if (missingIds.length > 0) {
        throw new Error(
          `Abstract ID(s) ${missingIds.join(", ")} do not exist in the Bill of Quantities. Please verify the IDs and try again.`,
        );
      }
      // Check for duplicates against existing data in DB
      const headingObj = estimate.customheadings?.find(
        (h) => h.heading === baseHeading,
      );
      if (headingObj && headingObj[key]) {
        const existingIds = new Set(headingObj[key].map((item) => item.abstract_id));
        const alreadyExists = csvAbstractIds.filter((id) => existingIds.has(id));
        if (alreadyExists.length > 0) {
          throw new Error(
            `Abstract ID(s) ${alreadyExists.join(", ")} already exist in '${key}'. Duplicate entries are not allowed.`,
          );
        }
      }

      for (const row of csvRows) {
        const amount = Number(row.amount) || 0;
        dataArray.push({
          abstract_id: row.abstract_id,
          description: row.description,
          unit: row.unit || "",
          quantity: Number(row.quantity) || 0,
          rate: Number(row.rate) || 0,
          amount,
          balance_quantity: Number(row.quantity) || 0,
          balance_amount: amount,
          phase_breakdown: [],
        });
        totalAmount += amount;
      }
    } else if (type === "detailed") {
      const detailedEstimate = await DetailedEstimateModel.findOne({
        tender_id,
      });
      if (!detailedEstimate)
        throw new Error("Detailed Estimate record not found for the specified Tender ID.");

      const estimate = detailedEstimate.detailed_estimate[0];
      if (!estimate || !estimate.customheadings)
        throw new Error("No custom work headings found for the specified Tender ID.");

      const headingObj = estimate.customheadings.find(
        (h) => h.heading === baseHeading,
      );
      if (!headingObj)
        throw new Error(
          `Custom heading '${baseHeading}' not found in the Detailed Estimate for this tender.`,
        );

      const abstractKey = `${baseHeading}abstract`;
      if (!headingObj[abstractKey] || headingObj[abstractKey].length === 0) {
        throw new Error(
          `The '${baseHeading}' abstract section is empty. Please add items to the abstract before uploading detailed entries.`,
        );
      }

      // Extract abstract_ids from CSV
      const csvAbstractIds = csvRows.map((row) => row.abstract_id);
      // Validate abstract_id exists in abstract array
      const abstractIds = new Set(
        headingObj[abstractKey].map((item) => item.abstract_id),
      );
      const missingInAbstract = csvAbstractIds.filter(
        (id) => !abstractIds.has(id),
      );
      if (missingInAbstract.length > 0) {
        throw new Error(
          `Abstract ID(s) ${missingInAbstract.join(", ")} are not present in the '${abstractKey}' section. Please add them to the abstract first.`,
        );
      }

      // Check for duplicates against existing detailed data in DB
      if (headingObj[key] && headingObj[key].length > 0) {
        const existingDetailedIds = new Set(headingObj[key].map((item) => item.abstract_id));
        const alreadyExists = [...new Set(csvAbstractIds)].filter((id) => existingDetailedIds.has(id));
        if (alreadyExists.length > 0) {
          throw new Error(
            `Detailed entries for Abstract ID(s) ${alreadyExists.join(", ")} already exist in '${key}'. Duplicate entries are not allowed.`,
          );
        }
      }

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
          phase_breakdown: [],
        });
      }
      for (const [abstract_id, breakdown] of Object.entries(grouped)) {
        dataArray.push({ abstract_id, breakdown });
      }
    }

    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate)
      throw new Error("Detailed Estimate record not found for the specified Tender ID.");

    if (detailedEstimate.detailed_estimate.length === 0) {
      detailedEstimate.detailed_estimate.push({
        customheadings: [],
        generalabstract: [],
        billofqty: [],
        total_spent: {},
      });
    }

    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.customheadings) estimate.customheadings = [];
    if (!estimate.generalabstract) estimate.generalabstract = [];
    if (!estimate.billofqty) estimate.billofqty = [];

    let headingObj = estimate.customheadings.find(
      (h) => h.heading === baseHeading,
    );
    if (!headingObj) {
      headingObj = { heading: baseHeading };
      estimate.customheadings.push(headingObj);
    }

    if (!headingObj[key]) headingObj[key] = [];
    headingObj[key].push(...dataArray);

    if (type === "abstract") {
      // Check for duplicate heading in generalabstract
      const existingGA = estimate.generalabstract.find((g) => g.heading === baseHeading);
      if (existingGA) {
        throw new Error(`Heading '${baseHeading}' already exists in General Abstract. Duplicate headings are not allowed.`);
      }

      estimate.generalabstract.push({
        heading: baseHeading,
        total_amount: totalAmount,
      });

      // Update dynamic fields (inletquantity, inletamount, etc.)
      if (Array.isArray(estimate.billofqty)) {
        for (const row of csvRows) {
          const item = estimate.billofqty.find(
            (b) => b.item_id === row.abstract_id,
          );
          if (item) {
            item[`${baseHeading}quantity`] = Number(row.quantity) || 0;
            item[`${baseHeading}amount`] =
              Number((row.quantity * item.n_rate).toFixed(2)) || 0;
          }
        }
      }

      // ✅ Calculate totals for ALL items (this is correct)
      for (const item of estimate.billofqty) {
        const quantityKeys = Object.keys(item).filter(
          (k) => k.endsWith("quantity") && k !== "total_quantity",
        );
        const amountKeys = Object.keys(item).filter(
          (k) => k.endsWith("amount") && k !== "total_amount",
        );

        item.total_quantity = quantityKeys.reduce(
          (sum, key) => sum + (Number(item[key]) || 0),
          0,
        );
        item.total_amount = amountKeys.reduce(
          (sum, key) => sum + (Number(item[key]) || 0),
          0,
        );
      }
      // Track total spent for this heading
      const headingAmountKey = `${baseHeading}amount`;
      const totalHeadingAmount = estimate.billofqty.reduce((sum, item) => {
        return sum + (Number(item[headingAmountKey]) || 0);
      }, 0);

      if (!estimate.total_spent) estimate.total_spent = {};
      estimate.total_spent[baseHeading] = totalHeadingAmount;
    }

    detailedEstimate.markModified("detailed_estimate");
    await detailedEstimate.save();
    return detailedEstimate;
  }

 static getLevelFromCode(code) {
    if (!code) return 0;
    code = code.toString().trim();

    // Level 1: Abstract (e.g., ABS001)
    if (/^[A-Z]{2,}[\s\-_]?\d+$/i.test(code)) return 1; 
    
    // Level 2: Detailed (e.g., 1, 2, 3)
    if (/^\d+(\.\d+)?$/.test(code)) return 2;

    return 0;
  }

  static async bulkInsertCustomHeadingsFromCsvNew(tender_id, nametype, csvRows) {
    if (!tender_id) throw new Error("Tender ID is required.");
    if (!nametype) throw new Error("Work category heading is required (e.g., 'road', 'bridge').");

    // normalize baseHeading
   const baseHeading = nametype.toLowerCase();

    // --- 1. SEPARATE ROWS INTO ABSTRACT AND DETAILED ---
    const abstractRows = [];
    const detailedRows = [];
    
    // Track the "current" abstract ID for detailed rows 
    let currentAbstractId = null; 

    for (const row of csvRows) {
        const code = row.Code; // Assumes CSV header is 'Code'
        const level = this.getLevelFromCode(code);

        if (level === 1) {
            currentAbstractId = code; // Context for subsequent detailed rows
            
            abstractRows.push({
                abstract_id: code,
                description: row.Description,
                unit: row.Unit,
                quantity: row.Quantity, // Main quantity for abstract
                rate: row.Rate,
                amount: row.Rate && row.Quantity ? (row.Rate * row.Quantity) : (Number(row.amount) || 0)
            });
        } else if (level === 2) {
            if (!currentAbstractId) {
                // If a detailed row appears before any abstract row, skip or throw error
                continue; 
            }

            detailedRows.push({
                abstract_id: currentAbstractId, // Link to parent
                particulars: row.Description,
                nos: row.Nos,
                l: row.Length,
                b: row.Breadth,
                d_h: row.Depth,
                content: row.Quantity // In detailed view, Quantity column is the content/volume
            });
        }
    }

    // --- 2. PROCESS ABSTRACT DATA (Validation & Structure) ---
    const abstractKey = `${baseHeading}abstract`;
    const abstractDataArray = [];
    let totalAmount = 0;

    if (abstractRows.length > 0) {
        // Extract all abstract_ids
        const csvAbstractIds = abstractRows.map((row) => row.abstract_id);

        // Check Duplicates within the file
        const seen = new Set();
        const duplicates = csvAbstractIds.filter((id) => {
            if (seen.has(id)) return true;
            seen.add(id);
            return false;
        });

        if (duplicates.length > 0) {
            throw new Error(`Duplicate Abstract IDs detected: ${[...new Set(duplicates)].join(", ")}. Each Abstract ID must be unique within the upload.`);
        }

        // Fetch billOfQty item_ids to validate existence
        const detailedEstimateDoc = await DetailedEstimateModel.findOne({ tender_id });
        if (!detailedEstimateDoc) throw new Error("Detailed Estimate record not found for the specified Tender ID.");

        const estimate = detailedEstimateDoc.detailed_estimate[0];
        if (!estimate || !estimate.billofqty) throw new Error("Bill of Quantities not found in the Detailed Estimate.");

        const billOfQtyItemIds = new Set(estimate.billofqty.map((item) => item.item_id));

        // Find missing IDs (Abstract IDs must exist in BOQ)
        const missingIds = csvAbstractIds.filter((id) => !billOfQtyItemIds.has(id));
        if (missingIds.length > 0) {
            throw new Error(`Abstract ID(s) ${missingIds.join(", ")} do not exist in the Bill of Quantities. Please verify the IDs and try again.`);
        }

        // Check for duplicates against existing abstract data in DB
        const existingHeadingObj = estimate.customheadings?.find(
          (h) => h.heading === baseHeading,
        );
        if (existingHeadingObj && existingHeadingObj[abstractKey]) {
          const existingAbstractIds = new Set(existingHeadingObj[abstractKey].map((item) => item.abstract_id));
          const alreadyExists = csvAbstractIds.filter((id) => existingAbstractIds.has(id));
          if (alreadyExists.length > 0) {
            throw new Error(
              `Abstract ID(s) ${alreadyExists.join(", ")} already exist in '${abstractKey}'. Duplicate entries are not allowed.`,
            );
          }
        }

        // Check for duplicate heading in generalabstract
        const existingGeneralAbstract = estimate.generalabstract?.find(
          (g) => g.heading === baseHeading,
        );
        if (existingGeneralAbstract) {
          throw new Error(
            `Heading '${baseHeading}' already exists in General Abstract. Duplicate headings are not allowed.`,
          );
        }

        // Prepare Abstract Data for DB
        for (const row of abstractRows) {
            const amount = Number(row.amount) || 0;
            abstractDataArray.push({
                abstract_id: row.abstract_id,
                description: row.description,
                unit: row.unit || "",
                quantity: Number(row.quantity) || 0,
                rate: Number(row.rate) || 0,
                amount,
                balance_quantity: Number(row.quantity) || 0,
                balance_amount: amount,
                phase_breakdown: [], // Default empty
            });
            totalAmount += amount;
        }
    }

    // --- 3. PROCESS DETAILED DATA (Grouping) ---
    const detailedKey = `${baseHeading}detailed`;
    const detailedDataArray = [];

    if (detailedRows.length > 0) {
        // Check for duplicates against existing detailed data in DB
        const detailedEstimateDoc = await DetailedEstimateModel.findOne({ tender_id });
        if (detailedEstimateDoc) {
          const est = detailedEstimateDoc.detailed_estimate[0];
          const existingHeadObj = est?.customheadings?.find((h) => h.heading === baseHeading);
          if (existingHeadObj && existingHeadObj[detailedKey] && existingHeadObj[detailedKey].length > 0) {
            const existingDetailedIds = new Set(existingHeadObj[detailedKey].map((item) => item.abstract_id));
            const csvDetailedIds = [...new Set(detailedRows.map((r) => r.abstract_id))];
            const alreadyExists = csvDetailedIds.filter((id) => existingDetailedIds.has(id));
            if (alreadyExists.length > 0) {
              throw new Error(
                `Detailed entries for Abstract ID(s) ${alreadyExists.join(", ")} already exist in '${detailedKey}'. Duplicate entries are not allowed.`,
              );
            }
          }
        }

        // Group detailed rows by their abstract_id
        const grouped = {};
        for (const row of detailedRows) {
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
                phase_breakdown: [],
            });
        }
        // Convert grouped object to array format required by schema
        for (const [abstract_id, breakdown] of Object.entries(grouped)) {
            detailedDataArray.push({ abstract_id, breakdown });
        }
    }

    // --- 4. DATABASE UPDATE ---
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    // Note: Re-fetching is safer if logic above was split, but we can reuse 'detailedEstimateDoc' if preferred.
    
    if (detailedEstimate.detailed_estimate.length === 0) {
        detailedEstimate.detailed_estimate.push({
            customheadings: [],
            generalabstract: [],
            billofqty: [],
            total_spent: {},
        });
    }

    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.customheadings) estimate.customheadings = [];
    if (!estimate.generalabstract) estimate.generalabstract = [];
    if (!estimate.billofqty) estimate.billofqty = [];

    // Find or Create Heading Object (e.g., 'road')
    let headingObj = estimate.customheadings.find((h) => h.heading === baseHeading);
    if (!headingObj) {
        headingObj = { heading: baseHeading };
        estimate.customheadings.push(headingObj);
    }

    // 4a. Save Abstract Data & Update BOQ
    if (abstractDataArray.length > 0) {
        if (!headingObj[abstractKey]) headingObj[abstractKey] = [];
        headingObj[abstractKey].push(...abstractDataArray);

        // Update General Abstract Summary
        estimate.generalabstract.push({
            heading: baseHeading,
            total_amount: totalAmount,
        });

        // Update Bill of Qty items (Dynamic Columns: roadquantity, roadamount)
        if (Array.isArray(estimate.billofqty)) {
            for (const row of abstractRows) {
                const item = estimate.billofqty.find((b) => b.item_id === row.abstract_id);
                if (item) {
                    item[`${baseHeading}quantity`] = Number(row.quantity) || 0;
                    item[`${baseHeading}amount`] = Number((row.quantity * item.n_rate).toFixed(2)) || 0;
                }
            }
        }

        // Recalculate totals for ALL items in BOQ
        for (const item of estimate.billofqty) {
            const quantityKeys = Object.keys(item).filter(
                (k) => k.endsWith("quantity") && k !== "total_quantity"
            );
            const amountKeys = Object.keys(item).filter(
                (k) => k.endsWith("amount") && k !== "total_amount"
            );

            item.total_quantity = quantityKeys.reduce((sum, key) => sum + (Number(item[key]) || 0), 0);
            item.total_amount = amountKeys.reduce((sum, key) => sum + (Number(item[key]) || 0), 0);
        }

        // Track total spent for this heading
        const headingAmountKey = `${baseHeading}amount`;
        const totalHeadingAmount = estimate.billofqty.reduce((sum, item) => {
            return sum + (Number(item[headingAmountKey]) || 0);
        }, 0);

        if (!estimate.total_spent) estimate.total_spent = {};
        estimate.total_spent[baseHeading] = totalHeadingAmount;
    }

    // 4b. Save Detailed Data
    if (detailedDataArray.length > 0) {
        if (!headingObj[detailedKey]) headingObj[detailedKey] = [];
        headingObj[detailedKey].push(...detailedDataArray);
    }

    detailedEstimate.markModified("detailed_estimate");
    await detailedEstimate.save();
    return detailedEstimate;
  }

  static async getCustomHeadingsByTenderAndNameTypeService(
    tender_id,
    nametype,
  ) {
    if (!tender_id) throw new Error("Tender ID is required.");
    if (!nametype) throw new Error("Section type (nametype) is required.");

    const match = nametype.match(/^(.*)(abstract|detailed)$/i);
    if (!match)
      throw new Error("Invalid section type. The section identifier must end with 'abstract' or 'detailed'.");

    const baseHeading = match[1].toLowerCase();
    const key = nametype.toLowerCase();

    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate)
      throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    if (!detailedEstimate.detailed_estimate.length)
      throw new Error("No Detailed Estimate records are available for this tender.");

    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.customheadings || !estimate.customheadings.length)
      throw new Error("No custom work headings found for this Detailed Estimate.");

    const headingObj = estimate.customheadings.find(
      (h) => h.heading === baseHeading,
    );
    if (!headingObj || !headingObj[key])
      throw new Error(`No data found for the '${nametype}' section in the Detailed Estimate.`);

    // If it's detailed, enrich with abstract details
    if (key.includes("detailed")) {
      const abstractKey = `${baseHeading}abstract`;
      const abstracts = headingObj[abstractKey] || [];

      const enrichedData = headingObj[key].map((detailedItem) => {
        const abstract = abstracts.find(
          (a) => a.abstract_id === detailedItem.abstract_id,
        );
        return {
          ...detailedItem,
          abstract_details: abstract
            ? {
                description: abstract.description,
                quantity: abstract.quantity,
                rate: abstract.rate,
              }
            : null,
        };
      });

      return enrichedData;
    }

    return headingObj[key];
  }

  static async getGeneralAbstractService(tender_id) {
    if (!tender_id) throw new Error("Tender ID is required.");
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate)
      throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    if (!detailedEstimate.detailed_estimate.length)
      throw new Error("No Detailed Estimate records are available for this tender.");
    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.generalabstract || !estimate.generalabstract.length)
      throw new Error("No General Abstract records found for this tender's Detailed Estimate.");
    return estimate.generalabstract;
  }

  static async getBillOfQtyService(tender_id) {
    if (!tender_id) throw new Error("Tender ID is required.");
    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate)
      throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    if (!detailedEstimate.detailed_estimate.length)
      throw new Error("No Detailed Estimate records are available for this tender.");
    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.billofqty || !estimate.billofqty.length)
      throw new Error("No Bill of Quantities found in the Detailed Estimate for this tender.");
    const billOfQty = estimate.billofqty;
    const spent = estimate.total_spent;
    return { billOfQty, spent };
  }

  static async addPhaseBreakdownToAbstractService(
    tender_id,
    nametype,
    description,
    phase,
    quantity,
  ) {
    if (!tender_id) throw new Error("Tender ID is required.");
    if (!nametype) throw new Error("Section type (nametype) is required.");
    if (!description) throw new Error("Work item description is required.");
    if (!phase) throw new Error("Construction phase is required.");
    if (typeof quantity !== "number" || quantity <= 0)
      throw new Error("A valid quantity greater than zero is required.");

    const match = nametype.match(/^(.*)(abstract)$/i);
    if (!match) throw new Error("Invalid section type. The section identifier must end with 'abstract'.");

    const baseHeading = match[1].toLowerCase();
    const key = nametype.toLowerCase();

    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate)
      throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    if (!detailedEstimate.detailed_estimate.length)
      throw new Error("No Detailed Estimate records are available for this tender.");

    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.customheadings || !estimate.customheadings.length)
      throw new Error("No custom work headings found for this Detailed Estimate.");

    const headingObj = estimate.customheadings.find(
      (h) => h.heading === baseHeading,
    );
    if (!headingObj || !headingObj[key])
      throw new Error(`No data found for the '${nametype}' section in the Detailed Estimate.`);

    const abstractIndex = headingObj[key].findIndex(
      (item) => item.description === description,
    );
    if (abstractIndex === -1)
      throw new Error("No abstract item found matching the provided description.");

    const abstractItem = headingObj[key][abstractIndex];
    const rate = abstractItem.rate;
    const totalQty = abstractItem.quantity;

    if (!rate) throw new Error("Unit rate is not defined for this abstract item. Please update the abstract before allocating phase quantities.");

    if (!Array.isArray(abstractItem.phase_breakdown))
      abstractItem.phase_breakdown = [];

    let currentSum = abstractItem.phase_breakdown.reduce(
      (acc, pb) => (pb.phase !== phase ? acc + pb.quantity : acc),
      0,
    );
    let phaseEntry = abstractItem.phase_breakdown.find(
      (pb) => pb.phase === phase,
    );

    if (phaseEntry) {
      if (currentSum + quantity > totalQty) {
        throw new Error(
          `Allocated quantity (${currentSum + quantity}) exceeds the available abstract quantity (${totalQty}). Please revise the phase allocation.`,
        );
      }
      phaseEntry.quantity = quantity;
      phaseEntry.amount = quantity * rate;
    } else {
      if (currentSum + quantity > totalQty) {
        throw new Error(
          `Allocated quantity (${currentSum + quantity}) exceeds the available abstract quantity (${totalQty}). Please revise the phase allocation.`,
        );
      }
      abstractItem.phase_breakdown.push({
        phase,
        quantity,
        amount: quantity * rate,
      });
    }

    const finalSum = abstractItem.phase_breakdown.reduce(
      (acc, pb) => acc + pb.quantity,
      0,
    );
    const finalAmount = abstractItem.phase_breakdown.reduce(
      (acc, pb) => acc + pb.amount,
      0,
    );
    abstractItem.balance_quantity = Math.max(totalQty - finalSum, 0);
    abstractItem.balance_amount = Math.max(
      abstractItem.amount - finalAmount,
      0,
    );

    const estimateIndex = 0;
    const customHeadingsIndex = estimate.customheadings.findIndex(
      (h) => h.heading === baseHeading,
    );
    const path = `detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIndex}.${key}.${abstractIndex}.phase_breakdown`;
    detailedEstimate.markModified(path);
    detailedEstimate.markModified(
      `detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIndex}.${key}.${abstractIndex}.balance_quantity`,
    );
    detailedEstimate.markModified(
      `detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIndex}.${key}.${abstractIndex}.balance_amount`,
    );

    await detailedEstimate.save();
    return {
      phase_breakdown: abstractItem.phase_breakdown,
      balance_quantity: abstractItem.balance_quantity,
      balance_amount: abstractItem.balance_amount,
    };
  }

  static async deleteAbstractDataByNametype(tender_id, nametype) {
    if (!tender_id) throw new Error("Tender ID is required.");
    if (!nametype) throw new Error("Nametype is required.");

    const baseHeading = nametype.toLowerCase();
    const abstractKey = `${baseHeading}abstract`;
    const detailedKey = `${baseHeading}detailed`;

    const doc = await DetailedEstimateModel.findOne({ tender_id });
    if (!doc) throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    if (!doc.detailed_estimate.length) throw new Error("No Detailed Estimate records found.");

    const estimate = doc.detailed_estimate[0];
    const headingIdx = estimate.customheadings?.findIndex((h) => h.heading === baseHeading) ?? -1;

    const setOps = {};
    if (headingIdx !== -1) {
      setOps[`detailed_estimate.0.customheadings.${headingIdx}.${abstractKey}`] = [];
      setOps[`detailed_estimate.0.customheadings.${headingIdx}.${detailedKey}`] = [];
    }

    // Clear the heading's contribution from BOQ and total_spent using MongoDB operators
    await DetailedEstimateModel.updateOne(
      { tender_id },
      {
        ...(Object.keys(setOps).length && { $set: setOps }),
        $unset: {
          [`detailed_estimate.0.total_spent.${baseHeading}`]: "",
          [`detailed_estimate.0.billofqty.$[].${baseHeading}quantity`]: "",
          [`detailed_estimate.0.billofqty.$[].${baseHeading}amount`]: "",
        },
        $pull: { "detailed_estimate.0.generalabstract": { heading: baseHeading } },
      },
    );

    // Recalculate BOQ totals now that the dynamic columns are removed
    const updated = await DetailedEstimateModel.findOne({ tender_id });
    const updatedEstimate = updated.detailed_estimate[0];

    if (Array.isArray(updatedEstimate.billofqty) && updatedEstimate.billofqty.length > 0) {
      const boqSetOps = {};
      updatedEstimate.billofqty.forEach((item, idx) => {
        const quantityKeys = Object.keys(item).filter((k) => k.endsWith("quantity") && k !== "total_quantity");
        const amountKeys = Object.keys(item).filter((k) => k.endsWith("amount") && k !== "total_amount");
        boqSetOps[`detailed_estimate.0.billofqty.${idx}.total_quantity`] = quantityKeys.reduce((sum, k) => sum + (Number(item[k]) || 0), 0);
        boqSetOps[`detailed_estimate.0.billofqty.${idx}.total_amount`] = amountKeys.reduce((sum, k) => sum + (Number(item[k]) || 0), 0);
      });
      await DetailedEstimateModel.updateOne({ tender_id }, { $set: boqSetOps });
    }
  }

  static async addPhaseBreakdownToDetailedService(
    tender_id,
    nametype,
    description,
    phase,
    quantity,
  ) {
    if (!tender_id) throw new Error("Tender ID is required.");
    if (!nametype) throw new Error("Section type (nametype) is required.");
    if (!description) throw new Error("Work item description is required.");
    if (!phase) throw new Error("Construction phase is required.");
    if (typeof quantity !== "number" || quantity <= 0)
      throw new Error("A valid quantity greater than zero is required.");

    const match = nametype.match(/^(.*)(detailed)$/i);
    if (!match) throw new Error("Invalid section type. The section identifier must end with 'detailed'.");

    const baseHeading = match[1].toLowerCase();
    const key = nametype.toLowerCase();

    const detailedEstimate = await DetailedEstimateModel.findOne({ tender_id });
    if (!detailedEstimate)
      throw new Error("Detailed Estimate record not found for the specified Tender ID.");
    if (!detailedEstimate.detailed_estimate.length)
      throw new Error("No Detailed Estimate records are available for this tender.");

    const estimate = detailedEstimate.detailed_estimate[0];
    if (!estimate.customheadings || !estimate.customheadings.length)
      throw new Error("No custom work headings found for this Detailed Estimate.");

    const headingObj = estimate.customheadings.find(
      (h) => h.heading === baseHeading,
    );
    if (!headingObj || !headingObj[key])
      throw new Error(`No data found for the '${nametype}' section in the Detailed Estimate.`);

    const detailedIndex = headingObj[key].findIndex(
      (item) => item.description === description,
    );
    if (detailedIndex === -1)
      throw new Error("No detailed item found matching the provided description.");

    const detailedItem = headingObj[key][detailedIndex];
    const totalContents = detailedItem.contents;

    if (!Array.isArray(detailedItem.phase_breakdown))
      detailedItem.phase_breakdown = [];

    let currentSum = detailedItem.phase_breakdown.reduce(
      (acc, pb) => (pb.phase !== phase ? acc + pb.quantity : acc),
      0,
    );
    let phaseEntry = detailedItem.phase_breakdown.find(
      (pb) => pb.phase === phase,
    );

    if (phaseEntry) {
      if (currentSum + quantity > totalContents) {
        throw new Error(
          `Allocated content (${currentSum + quantity}) exceeds the available content (${totalContents}) for this detailed item. Please revise the phase allocation.`,
        );
      }
      phaseEntry.quantity = quantity;
    } else {
      if (currentSum + quantity > totalContents) {
        throw new Error(
          `Allocated content (${currentSum + quantity}) exceeds the available content (${totalContents}) for this detailed item. Please revise the phase allocation.`,
        );
      }
      detailedItem.phase_breakdown.push({ phase, quantity });
    }

    const finalSum = detailedItem.phase_breakdown.reduce(
      (acc, pb) => acc + pb.quantity,
      0,
    );
    detailedItem.balance_quantity = Math.max(totalContents - finalSum, 0);

    const estimateIndex = 0;
    const customHeadingsIdx = estimate.customheadings.findIndex(
      (h) => h.heading === baseHeading,
    );
    const path = `detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIdx}.${key}.${detailedIndex}.phase_breakdown`;
    detailedEstimate.markModified(path);
    detailedEstimate.markModified(
      `detailed_estimate.${estimateIndex}.customheadings.${customHeadingsIdx}.${key}.${detailedIndex}.balance_quantity`,
    );

    await detailedEstimate.save();
    return {
      phase_breakdown: detailedItem.phase_breakdown,
      balance_quantity: detailedItem.balance_quantity,
    };
  }
}

export default detailedestimateService;
