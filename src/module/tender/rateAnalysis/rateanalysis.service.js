import WorkItemModel from "./rateanalysis.model.js";
import BoqModel from "../boq/boq.model.js";
import RAQuantityModel from "../rateanalyisquantites/rateanalysisquantities.model.js";
import BidModel from "../bid/bid.model.js";
import SiteOverheads from "../siteoverheads/siteoverhead.model.js";
import TenderModel from "../tender/tender.model.js";
import MaterialModel from "../materials/material.model.js";

class WorkItemService {
  static async addWorkItem(data) {
    const workItem = new WorkItemModel(data);
    return await workItem.save();
  }

  static async getAllWorkItems() {
    return await WorkItemModel.find();
  }

  static async getWorkItemById(id) {
    return await WorkItemModel.findById(id);
  }

  static async getWorkItemsByTenderId(tenderId) {
    return await WorkItemModel.findOne({ tender_id: tenderId });
  }

  static async updateWorkItem(id, updateData) {
    return await WorkItemModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  static async deleteWorkItem(id) {
    return await WorkItemModel.findByIdAndDelete(id);
  }

  static async bulkInsertWorkItemsFromCsv(csvRows, tender_id, created_by_user = "SYSTEM") {
    // Round 1: all independent reads in parallel (6 DB calls → 1 round trip)
    const [existingDoc, bid, boq, siteOverheads, raDocExisting, matDocExisting] = await Promise.all([
      WorkItemModel.findOne({ tender_id }),
      BidModel.findOne({ tender_id }),
      BoqModel.findOne({ tender_id }),
      SiteOverheads.findOne({ tenderId: tender_id }),
      RAQuantityModel.findOne({ tender_id }),
      MaterialModel.findOne({ tender_id }),
    ]);

    // Validations (use already-fetched docs)
    if (existingDoc?.freeze) {
      const err = new Error("Rate Analysis is frozen and cannot be modified. Unfreeze it before re-uploading.");
      err.statusCode = 422;
      throw err;
    }
    if (!bid) {
      const err = new Error("No Bid record found for this tender. Please submit a Bid before uploading Rate Analysis data.");
      err.statusCode = 400;
      throw err;
    }
    if (bid.freezed === false) {
      const err = new Error("The Bid must be frozen before uploading Rate Analysis data. Please freeze the Bid and retry.");
      err.statusCode = 422;
      throw err;
    }

    // 1. BOQ already loaded above
    const boqItems = boq?.items || [];

    // Map item_id -> boq item (reference)
    const boqById = new Map();
    for (const item of boqItems) {
      if (!item?.item_id) continue;
      boqById.set(String(item.item_id).trim(), item);
    }
    // 2. Group CSV rows by itemNo (stateful: detail rows inherit the current MAIN_ITEM parent)
    const grouped = new Map(); // itemNo -> { mainRow, detailRows: [] }
    let currentMainItemNo = null; // 👈 Tracks the active parent (e.g., ABS001)

    for (const rawRow of csvRows) {
      if (!rawRow) continue;

      // Get the ID of the current row (e.g., "ABS001" or "1")
      const rowItemId = rawRow.ITEM_ID != null ? String(rawRow.ITEM_ID).trim() : "";
      if (!rowItemId) continue;

      const category = rawRow.CATEGORY != null ? String(rawRow.CATEGORY).trim() : "";

      if (category === "MAIN_ITEM") {
        // 🟢 Case A: This is a Parent Row (ABS001)
        currentMainItemNo = rowItemId; // Update the active parent

        // Validation: Parent must exist in BOQ
        if (!boqById.has(currentMainItemNo)) {
          const err = new Error(`Work item "${currentMainItemNo}" was not found in the Bill of Quantities. Please verify the Item ID in your CSV and try again.`);
          err.statusCode = 400;
          throw err;
        }

        // Initialize group
        let entry = grouped.get(currentMainItemNo);
        if (!entry) {
          entry = { mainRow: null, detailRows: [] };
          grouped.set(currentMainItemNo, entry);
        }
        entry.mainRow = rawRow;

      } else {
        // 🟡 Case B: This is a Detail Row (1, 2, 3...)
        // We ignore rowItemId ("1") for grouping, and use currentMainItemNo ("ABS001")
        
        if (!currentMainItemNo) {
           // Safety check: ignore orphan rows at the start of file
           continue; 
        }

        let entry = grouped.get(currentMainItemNo);
        if (entry) {
          entry.detailRows.push(rawRow);
        }
      }
    }

    // 3. Build work_items + update BOQ, and in parallel accumulate RA quantities
    const work_items = [];

    // BOQ totals accumulators
    let boq_total_amount = 0;
    let zero_cost_total_amount = 0;
    let variance_amount_total = 0;
    let consumable_material_total = 0;
    let bulk_material_total = 0;
    let machinery_total = 0;
    let fuel_total = 0;
    let contractor_total = 0;
    let nmr_total = 0;

    // RAQuantity accumulators
    const raBuckets = {
      consumable_material: new Map(), // key -> ItemSchema-like obj
      bulk_material: new Map(),
      machinery: new Map(),
      fuel: new Map(),
      contractor: new Map(),
      nmr: new Map()
    };

    const materialBucket = new Map();

    // helper to map category to RA bucket name
    const categoryToBucket = (category) => {
      switch (category) {
        case "MT-CM": return "consumable_material";
        case "MT-BL": return "bulk_material";
        case "MY-M": return "machinery";
        case "MY-F": return "fuel";
        case "MP-C": return "contractor";
        case "MP-NMR": return "nmr";
        default: return null;
      }
    };

    for (const [itemNo, { mainRow, detailRows }] of grouped.entries()) {
      if (!mainRow) continue;

      const working_quantity = Number(Number(mainRow.WORKING_QUANTITY || 0).toFixed(4));
      const unit = mainRow.UNIT || null;

      // workItem text from BOQ; fallback to MAIN_ITEM description or generic label
      const boqItem = boqById.get(itemNo);
      const workItem =
        (boqItem?.description || "").trim() ||
        (mainRow.DESCRIPTION || "").trim() ||
        `Item ${itemNo}`;

      const lines = [];
      const categoryTotals = {
        "MT-CM": 0,
        "MT-BL": 0,
        "MY-M": 0,
        "MY-F": 0,
        "MP-C": 0,
        "MP-NMR": 0
      };

      for (const rawRow of detailRows) {
        const category =
          rawRow.CATEGORY != null ? String(rawRow.CATEGORY).trim() : "";

        const lineQuantity = Number(
          Number(rawRow.WORKING_QUANTITY != null
            ? rawRow.WORKING_QUANTITY
            : rawRow.QUANTITY || 0).toFixed(4)
        );
        const rate = Number(Number(rawRow.RATE || 0).toFixed(2));
        const amount = Number((lineQuantity * rate).toFixed(2));
        const total_rate =
          working_quantity > 0
            ? Number((amount / working_quantity).toFixed(4))
            : 0;

        const line = {
          category,
          description: rawRow.DESCRIPTION || "",
          unit: rawRow.UNIT || "",
          quantity: lineQuantity,
          rate,
          amount,
          total_rate,
          resourceGroup: rawRow.RESOURCE_GROUP || "",
        };

        lines.push(line);

        if (Object.prototype.hasOwnProperty.call(categoryTotals, category)) {
          categoryTotals[category] += total_rate;
        }

        // --- RAQuantity + Material accumulation per line ---
        const bucketName = categoryToBucket(category);
        if (bucketName && boqItem && working_quantity > 0) {
          const boqQty = Number(boqItem.quantity || 0);
          const raQty = Number(((lineQuantity / working_quantity) * boqQty).toFixed(4));

          // composite key per description + unit + category
          const key = `${category}||${line.description}||${line.unit}`;
          const bucket = raBuckets[bucketName];

          let itemAgg = bucket.get(key);
          if (!itemAgg) {
            itemAgg = {
              item_description: line.description,
              category,
              unit: line.unit,
              quantity: [],
              total_item_quantity: 0,
              unit_rate: rate,
              tax_percent: 0,
              escalation_percent: 0,
              tax_amount: 0,
              total_amount: 0,
              escalation_amount: 0,
              percentage_value_of_material: 0,
              resourceGroup: line.resourceGroup || "",
            };
            bucket.set(key, itemAgg);
          }

          itemAgg.quantity.push(raQty);
          itemAgg.total_item_quantity += raQty;

          if (category === "MT-CM" || category === "MT-BL") {
            const matKey = key;
            let matAgg = materialBucket.get(matKey);
            if (!matAgg) {
              matAgg = {
                item_description: line.description,
                category,
                unit: line.unit,
                quantity: [],
                total_item_quantity: 0,
                unit_rate: rate,
                resourceGroup: line.resourceGroup || "",
                total_amount: 0,
                opening_stock: 0,
                total_received_qty: 0,
                total_issued_qty: 0,
                current_stock_on_hand: 0,
                pending_procurement_qty: 0,
              };
              materialBucket.set(matKey, matAgg);
            }

            matAgg.quantity.push(raQty);
            matAgg.total_item_quantity += raQty;
            matAgg.total_amount = Number((matAgg.total_item_quantity * matAgg.unit_rate).toFixed(2));
            matAgg.pending_procurement_qty = matAgg.total_item_quantity;
          }
        }
      }

      // Round category rates to 2 decimals
      const MT_CM_rate = Number(categoryTotals["MT-CM"].toFixed(2));
      const MT_BL_rate = Number(categoryTotals["MT-BL"].toFixed(2));
      const MY_M_rate = Number(categoryTotals["MY-M"].toFixed(2));
      const MY_F_rate = Number(categoryTotals["MY-F"].toFixed(2));
      const MP_C_rate = Number(categoryTotals["MP-C"].toFixed(2));
      const MP_NMR_rate = Number(categoryTotals["MP-NMR"].toFixed(2));

      const final_rate_raw =
        MT_CM_rate +
        MT_BL_rate +
        MY_M_rate +
        MY_F_rate +
        MP_C_rate +
        MP_NMR_rate;

      const final_rate = Number(final_rate_raw.toFixed(2));

      work_items.push({
        itemNo,
        workItem,
        unit,
        working_quantity,
        category: "MAIN_ITEM",
        MT_CM_rate,
        MT_BL_rate,
        MY_M_rate,
        MY_F_rate,
        MP_C_rate,
        MP_NMR_rate,
        final_rate,
        lines
      });

      // 4. If corresponding BOQ item exists, compute its dynamic fields
      if (boqItem) {
        const boqQty = Number(boqItem.quantity || 0);
        const n_rate = Number(boqItem.n_rate || 0);
        const n_amount = Number(
          boqItem.n_amount != null ? boqItem.n_amount : boqQty * n_rate || 0
        );

        const consumable_material_rate = MT_CM_rate;
        const consumable_material_amount = Number(
          (boqQty * consumable_material_rate).toFixed(2)
        );

        const bulk_material_rate = MT_BL_rate;
        const bulk_material_amount = Number(
          (boqQty * bulk_material_rate).toFixed(2)
        );

        const machinery_rate = MY_M_rate;
        const machinery_amount = Number(
          (boqQty * machinery_rate).toFixed(2)
        );

        const fuel_rate = MY_F_rate;
        const fuel_amount = Number((boqQty * fuel_rate).toFixed(2));

        const contractor_rate = MP_C_rate;
        const contractor_amount = Number(
          (boqQty * contractor_rate).toFixed(2)
        );

        const nmr_rate = MP_NMR_rate;
        const nmr_amount = Number((boqQty * nmr_rate).toFixed(2));

        const final_rate_item = final_rate; // already 2 decimals
        const final_amount = Number(
          (boqQty * final_rate_item).toFixed(2)
        );

        const variance_amount = Number(
          (final_amount - n_amount).toFixed(2)
        );
        const variance_percentage =
          n_amount > 0
            ? Number(((variance_amount / n_amount) * 100).toFixed(2))
            : 0;
        const drawing_quantity = boqQty;

        // assign back into boqItem
        boqItem.consumable_material_rate = consumable_material_rate;
        boqItem.consumable_material_amount = consumable_material_amount;
        boqItem.bulk_material_rate = bulk_material_rate;
        boqItem.bulk_material_amount = bulk_material_amount;
        boqItem.machinery_rate = machinery_rate;
        boqItem.machinery_amount = machinery_amount;
        boqItem.fuel_rate = fuel_rate;
        boqItem.fuel_amount = fuel_amount;
        boqItem.contractor_rate = contractor_rate;
        boqItem.contractor_amount = contractor_amount;
        boqItem.nmr_rate = nmr_rate;
        boqItem.nmr_amount = nmr_amount;
        boqItem.final_rate = final_rate_item;
        boqItem.final_amount = final_amount;
        boqItem.variance_amount = variance_amount;
        boqItem.variance_percentage = variance_percentage;
        boqItem.drawing_quantity = drawing_quantity;

        // accumulate BOQ totals
        boq_total_amount += n_amount;
        zero_cost_total_amount += final_amount;
        variance_amount_total += variance_amount;
        consumable_material_total += consumable_material_amount;
        bulk_material_total += bulk_material_amount;
        machinery_total += machinery_amount;
        fuel_total += fuel_amount;
        contractor_total += contractor_amount;
        nmr_total += nmr_amount;
      }
    }

    // 5. Build WorkItems doc (reuse existingDoc fetched in round 1 — no duplicate findOne)
    let doc = existingDoc || new WorkItemModel({ tender_id });
    doc.work_items = work_items;

    // 6. Prepare BOQ totals
    if (boq) {
      const total_material_amount = consumable_material_total + bulk_material_total;
      const total_machine_amount = machinery_total + fuel_total;
      const total_labor_amount = contractor_total + nmr_total;

      boq.boq_total_amount = Number(boq_total_amount.toFixed(2));
      boq.zero_cost_total_amount = Number(zero_cost_total_amount.toFixed(2));
      boq.variance_amount = Number(variance_amount_total.toFixed(2));
      boq.variance_percentage = Number(((variance_amount_total / (boq_total_amount || 1)) * 100).toFixed(2));
      boq.consumable_material = Number(consumable_material_total.toFixed(2));
      boq.bulk_material = Number(bulk_material_total.toFixed(2));
      boq.total_material_amount = Number(total_material_amount.toFixed(2));
      boq.machinery = Number(machinery_total.toFixed(2));
      boq.fuel = Number(fuel_total.toFixed(2));
      boq.total_machine_amount = Number(total_machine_amount.toFixed(2));
      boq.contractor = Number(contractor_total.toFixed(2));
      boq.nmr = Number(nmr_total.toFixed(2));
      boq.total_labor_amount = Number(total_labor_amount.toFixed(2));
    }

    // 7. Build RA quantity data
    const mapRaBucket = (it, extra = {}) => ({
      ...it,
      quantity: it.quantity.map((q) => Number(q.toFixed(4))),
      total_item_quantity: Number(it.total_item_quantity.toFixed(2)),
      total_amount: Number((it.total_item_quantity * it.unit_rate).toFixed(2)),
      tax_amount: 0,
      final_amount: Number((it.total_item_quantity * it.unit_rate).toFixed(2)),
      ...extra,
    });

    const raQuantites = {
      consumable_material: Array.from(raBuckets.consumable_material.values()).map((it) => mapRaBucket(it)),
      bulk_material: Array.from(raBuckets.bulk_material.values()).map((it) => mapRaBucket(it)),
      machinery: Array.from(raBuckets.machinery.values()).map((it) => mapRaBucket(it)),
      fuel: Array.from(raBuckets.fuel.values()).map((it) => mapRaBucket(it)),
      contractor: Array.from(raBuckets.contractor.values()).map((it) => mapRaBucket(it, { ex_quantity: Number(it.total_item_quantity.toFixed(2)) })),
      nmr: Array.from(raBuckets.nmr.values()).map((it) => mapRaBucket(it)),
    };

    if (raDocExisting) {
      raDocExisting.quantites = raQuantites;
      raDocExisting.created_by_user = created_by_user;
    }
    const raDoc = raDocExisting || new RAQuantityModel({ tender_id, quantites: raQuantites, created_by_user });

    // 8. Build material data
    const materialItems = Array.from(materialBucket.values()).map((it) => ({
      ...it,
      quantity: it.quantity.map((q) => Number(q.toFixed(4))),
      total_item_quantity: Number(it.total_item_quantity.toFixed(2)),
      total_amount: Number(it.total_amount.toFixed(2)),
      pending_procurement_qty: Number(it.total_item_quantity.toFixed(2)),
    }));

    let matDoc = null;
    if (materialItems.length > 0) {
      if (matDocExisting) {
        matDocExisting.items = materialItems;
        matDocExisting.created_by_user = created_by_user;
        matDoc = matDocExisting;
      } else {
        matDoc = new MaterialModel({ tender_id, items: materialItems, created_by_user });
      }
    }

    // 9. Calculate summary (siteOverheads already fetched in round 1)
    if (boq) {
      const s_zero_cost = Number(boq.zero_cost_total_amount || 0);
      const s_boq_total = Number(boq.boq_total_amount || 0);
      const siteoverhead_total_amount = Number(siteOverheads?.grand_total_overheads_rs || 0);
      const escalation_benefits_percentage = Number(siteOverheads?.escalation_benefits_percentage || 0);
      const risk_contingency = Number(siteOverheads?.risk_contingency || 0);
      const ho_overheads = Number(siteOverheads?.ho_overheads || 0);

      const total_cost = s_zero_cost + siteoverhead_total_amount;
      const margin = total_cost - s_boq_total;
      const total_margin = margin + (margin * escalation_benefits_percentage) / 100;
      const grossmargin_percentage = s_boq_total > 0 ? (total_margin * 100) / s_boq_total : 0;
      const PBT = grossmargin_percentage - risk_contingency - ho_overheads;

      doc.summary = {
        zero_cost_total_amount: s_zero_cost,
        siteoverhead_total_amount,
        total_cost,
        boq_total_amount: s_boq_total,
        margin,
        escalation_benefits_percentage,
        total_margin,
        grossmargin_percentage,
        risk_contingency,
        ho_overheads,
        PBT,
      };
    }

    // Round 2: all independent writes in parallel (4 DB saves → 1 round trip)
    await Promise.all([
      doc.save(),
      boq ? boq.save() : Promise.resolve(),
      raDoc.save(),
      matDoc ? matDoc.save() : Promise.resolve(),
    ]);

    return doc;
  }


static async updateRateAnalysis(payload, tender_id, created_by_user = "SYSTEM") {

    if (!tender_id) throw new Error("Tender ID is required.");

    // Round 1: all independent reads in parallel (5 DB calls → 1 round trip)
    const [boq, existingDoc, siteOverheads, raDocExisting, matDocExisting] = await Promise.all([
      BoqModel.findOne({ tender_id }),
      WorkItemModel.findOne({ tender_id }),
      SiteOverheads.findOne({ tenderId: tender_id }),
      RAQuantityModel.findOne({ tender_id }),
      MaterialModel.findOne({ tender_id }),
    ]);

    const boqItems = boq?.items || [];

    // Map item_id -> boq item (reference)
    const boqById = new Map();
    for (const item of boqItems) {
      if (!item?.item_id) continue;
      boqById.set(String(item.item_id).trim(), item);
    }

    // 2. Group payload work_items by itemNo
    const grouped = new Map();
    for (const rawRow of payload) {
      if (!rawRow) continue;
      const itemNo = rawRow.itemNo != null ? String(rawRow.itemNo).trim() : "";
      if (!itemNo) continue;

      const category = rawRow.category != null ? String(rawRow.category).trim() : "";
      let entry = grouped.get(itemNo);
      if (!entry) {
        entry = { mainRow: null, detailRows: [] };
        grouped.set(itemNo, entry);
      }
      if (category === "MAIN_ITEM") {
        entry.mainRow = rawRow;
      } else {
        entry.detailRows.push(rawRow);
      }
    }

    // 3. Build updated work_items + update BOQ, and in parallel accumulate RA & Material quantities
    const work_items = [];
    let boq_total_amount = 0;
    let zero_cost_total_amount = 0;
    let variance_amount_total = 0;
    let consumable_material_total = 0;
    let bulk_material_total = 0;
    let machinery_total = 0;
    let fuel_total = 0;
    let contractor_total = 0;
    let nmr_total = 0;

    const raBuckets = {
      consumable_material: new Map(),
      bulk_material: new Map(),
      machinery: new Map(),
      fuel: new Map(),
      contractor: new Map(),
      nmr: new Map()
    };

    // --- NEW: Material Accumulator ---
    const materialBucket = new Map();

    const categoryToBucket = (category) => {
      switch (category) {
        case "MT-CM": return "consumable_material";
        case "MT-BL": return "bulk_material";
        case "MY-M": return "machinery";
        case "MY-F": return "fuel";
        case "MP-C": return "contractor";
        case "MP-NMR": return "nmr";
        default: return null;
      }
    };

    for (const [itemNo, { mainRow, detailRows }] of grouped.entries()) {
      if (!mainRow) {
        continue;
      }

      const working_quantity = Number(Number(mainRow.working_quantity || 0).toFixed(4));
      const unit = mainRow.unit || null;
      const boqItem = boqById.get(itemNo);

      const workItem =
        (boqItem?.description || "").trim() ||
        (mainRow.description || "").trim() ||
        `Item ${itemNo}`;

      const lines = [];
      const categoryTotals = {
        "MT-CM": 0, "MT-BL": 0, "MY-M": 0, "MY-F": 0, "MP-C": 0, "MP-NMR": 0
      };

      for (const rawRow of detailRows) {
        const category =
          rawRow.category != null ? String(rawRow.category).trim() : "";
        const lineQuantity = Number(
          Number(rawRow.working_quantity != null
            ? rawRow.working_quantity
            : rawRow.quantity || 0).toFixed(4)
        );
        const rate = Number(Number(rawRow.rate || 0).toFixed(2));
        const amount = Number((lineQuantity * rate).toFixed(2));
        const total_rate =
          working_quantity > 0
            ? Number((amount / working_quantity).toFixed(4))
            : 0;

        const line = {
          category,
          description: rawRow.description || "",
          unit: rawRow.unit || "",
          quantity: lineQuantity,
          rate,
          amount,
          total_rate,
          resourceGroup: rawRow.resourceGroup || "",
        };

        lines.push(line);

        if (Object.prototype.hasOwnProperty.call(categoryTotals, category)) {
          categoryTotals[category] += total_rate;
        }

        // --- Common Quantity Logic (RA + Materials) ---
        if (boqItem && working_quantity > 0) {
            const boqQty = Number(boqItem.quantity || 0);
            const totalReqQtyRaw = (lineQuantity / working_quantity) * boqQty;
            const totalReqQty = Number(totalReqQtyRaw.toFixed(4));
            
            // 1. RA Bucket Logic
            const bucketName = categoryToBucket(category);
            if (bucketName) {
                const key = `${category}||${line.description}||${line.unit}`;
                const bucket = raBuckets[bucketName];

                let itemAgg = bucket.get(key);
                if (!itemAgg) {
                    itemAgg = {
                        item_description: line.description,
                        category,
                        unit: line.unit,
                        quantity: [],
                        total_item_quantity: 0,
                        unit_rate: rate,
                        resourceGroup: line.resourceGroup || "",
                        tax_percent: 0,
                        escalation_percent: 0,
                        tax_amount: 0,
                        total_amount: 0,
                        escalation_amount: 0,
                        percentage_value_of_material: 0
                    };
                    bucket.set(key, itemAgg);
                }

                itemAgg.quantity.push(totalReqQty);
                itemAgg.total_item_quantity += totalReqQty;
            }

            // 2. Material Model Logic (Only MT-CM & MT-BL)
            if (category === "MT-CM" || category === "MT-BL") {
                const matKey = `${category}||${line.description}||${line.unit}`;
                let matAgg = materialBucket.get(matKey);
                if (!matAgg) {
                  matAgg = {
                    item_description: line.description,
                    category,
                    unit: line.unit,
                    quantity: [],
                    total_item_quantity: 0,
                    unit_rate: rate,
                    resourceGroup: line.resourceGroup || "",
                    total_amount: 0,
                    opening_stock: 0,
                    total_received_qty: 0,
                    total_issued_qty: 0,
                    current_stock_on_hand: 0,
                    pending_procurement_qty: 0,
                  };
                  materialBucket.set(matKey, matAgg);
                }

                matAgg.quantity.push(totalReqQty);
                matAgg.total_item_quantity += totalReqQty;
                matAgg.total_amount = Number((matAgg.total_item_quantity * matAgg.unit_rate).toFixed(2));
                matAgg.pending_procurement_qty = matAgg.total_item_quantity;
            }
        }
      }

      // Round category rates to 2 decimals
      const MT_CM_rate = Number(categoryTotals["MT-CM"].toFixed(2));
      const MT_BL_rate = Number(categoryTotals["MT-BL"].toFixed(2));
      const MY_M_rate = Number(categoryTotals["MY-M"].toFixed(2));
      const MY_F_rate = Number(categoryTotals["MY-F"].toFixed(2));
      const MP_C_rate = Number(categoryTotals["MP-C"].toFixed(2));
      const MP_NMR_rate = Number(categoryTotals["MP-NMR"].toFixed(2));

      const final_rate_raw =
        MT_CM_rate +
        MT_BL_rate +
        MY_M_rate +
        MY_F_rate +
        MP_C_rate +
        MP_NMR_rate;

      const final_rate = Number(final_rate_raw.toFixed(2));

      work_items.push({
        itemNo,
        workItem,
        unit,
        working_quantity,
        category: "MAIN_ITEM",
        MT_CM_rate,
        MT_BL_rate,
        MY_M_rate,
        MY_F_rate,
        MP_C_rate,
        MP_NMR_rate,
        final_rate,
        lines
      });

      // 4. If corresponding BOQ item exists, compute its dynamic fields
      if (boqItem) {
        const boqQty = Number(boqItem.quantity || 0);
        const n_rate = Number(boqItem.n_rate || 0);
        const n_amount = Number(
          boqItem.n_amount != null ? boqItem.n_amount : boqQty * n_rate || 0
        );

        const consumable_material_rate = MT_CM_rate;
        const consumable_material_amount = Number(
          (boqQty * consumable_material_rate).toFixed(2)
        );
        const bulk_material_rate = MT_BL_rate;
        const bulk_material_amount = Number(
          (boqQty * bulk_material_rate).toFixed(2)
        );
        const machinery_rate = MY_M_rate;
        const machinery_amount = Number(
          (boqQty * machinery_rate).toFixed(2)
        );
        const fuel_rate = MY_F_rate;
        const fuel_amount = Number((boqQty * fuel_rate).toFixed(2));
        const contractor_rate = MP_C_rate;
        const contractor_amount = Number(
          (boqQty * contractor_rate).toFixed(2)
        );
        const nmr_rate = MP_NMR_rate;
        const nmr_amount = Number((boqQty * nmr_rate).toFixed(2));
        const final_rate_item = final_rate;
        const final_amount = Number(
          (boqQty * final_rate_item).toFixed(2)
        );
        const variance_amount = Number(
          (final_amount - n_amount).toFixed(2)
        );
        const variance_percentage =
          n_amount > 0
            ? Number(((variance_amount / n_amount) * 100).toFixed(2))
            : 0;
        const drawing_quantity = boqQty;

        // assign back into boqItem
        boqItem.consumable_material_rate = consumable_material_rate;
        boqItem.consumable_material_amount = consumable_material_amount;
        boqItem.bulk_material_rate = bulk_material_rate;
        boqItem.bulk_material_amount = bulk_material_amount;
        boqItem.machinery_rate = machinery_rate;
        boqItem.machinery_amount = machinery_amount;
        boqItem.fuel_rate = fuel_rate;
        boqItem.fuel_amount = fuel_amount;
        boqItem.contractor_rate = contractor_rate;
        boqItem.contractor_amount = contractor_amount;
        boqItem.nmr_rate = nmr_rate;
        boqItem.nmr_amount = nmr_amount;
        boqItem.final_rate = final_rate_item;
        boqItem.final_amount = final_amount;
        boqItem.variance_amount = variance_amount;
        boqItem.variance_percentage = variance_percentage;
        boqItem.drawing_quantity = drawing_quantity;

        // accumulate BOQ totals
        boq_total_amount += n_amount;
        zero_cost_total_amount += final_amount;
        variance_amount_total += variance_amount;
        consumable_material_total += consumable_material_amount;
        bulk_material_total += bulk_material_amount;
        machinery_total += machinery_amount;
        fuel_total += fuel_amount;
        contractor_total += contractor_amount;
        nmr_total += nmr_amount;
      }
    }

    // 5. Build WorkItems doc (reuse existingDoc fetched in round 1 — no duplicate findOne)
    let doc = existingDoc || new WorkItemModel({ tender_id });
    doc.work_items = work_items;

    // 6. Prepare BOQ totals
    if (boq) {
      const total_material_amount = consumable_material_total + bulk_material_total;
      const total_machine_amount = machinery_total + fuel_total;
      const total_labor_amount = contractor_total + nmr_total;

      boq.boq_total_amount = Number(boq_total_amount.toFixed(2));
      boq.zero_cost_total_amount = Number(zero_cost_total_amount.toFixed(2));
      boq.variance_amount = Number(variance_amount_total.toFixed(2));
      boq.variance_percentage = Number(((variance_amount_total / (boq_total_amount || 1)) * 100).toFixed(2));
      boq.consumable_material = Number(consumable_material_total.toFixed(2));
      boq.bulk_material = Number(bulk_material_total.toFixed(2));
      boq.total_material_amount = Number(total_material_amount.toFixed(2));
      boq.machinery = Number(machinery_total.toFixed(2));
      boq.fuel = Number(fuel_total.toFixed(2));
      boq.total_machine_amount = Number(total_machine_amount.toFixed(2));
      boq.contractor = Number(contractor_total.toFixed(2));
      boq.nmr = Number(nmr_total.toFixed(2));
      boq.total_labor_amount = Number(total_labor_amount.toFixed(2));
    }

    // 7. Build RA quantity data
    const mapRaBucketU = (it, extra = {}) => ({
      ...it,
      quantity: it.quantity.map((q) => Number(q.toFixed(4))),
      total_item_quantity: Number(it.total_item_quantity.toFixed(2)),
      total_amount: Number((it.total_item_quantity * it.unit_rate).toFixed(2)),
      tax_amount: Number((it.total_item_quantity * it.unit_rate * (it.tax_percent / 100)).toFixed(2)),
      final_amount: Number((it.total_item_quantity * it.unit_rate).toFixed(2)),
      ...extra,
    });

    const raQuantites = {
      consumable_material: Array.from(raBuckets.consumable_material.values()).map((it) => mapRaBucketU(it)),
      bulk_material: Array.from(raBuckets.bulk_material.values()).map((it) => mapRaBucketU(it)),
      machinery: Array.from(raBuckets.machinery.values()).map((it) => mapRaBucketU(it)),
      fuel: Array.from(raBuckets.fuel.values()).map((it) => mapRaBucketU(it)),
      contractor: Array.from(raBuckets.contractor.values()).map((it) => mapRaBucketU(it, { ex_quantity: Number(it.total_item_quantity.toFixed(2)) })),
      nmr: Array.from(raBuckets.nmr.values()).map((it) => mapRaBucketU(it)),
    };

    if (raDocExisting) {
      raDocExisting.quantites = raQuantites;
      raDocExisting.created_by_user = created_by_user;
    }
    const raDoc = raDocExisting || new RAQuantityModel({ tender_id, quantites: raQuantites, created_by_user });

    // 8. Build material data
    const materialItems = Array.from(materialBucket.values()).map((it) => ({
      ...it,
      quantity: it.quantity.map((q) => Number(q.toFixed(4))),
      total_item_quantity: Number(it.total_item_quantity.toFixed(2)),
      total_amount: Number(it.total_amount.toFixed(2)),
      pending_procurement_qty: Number(it.total_item_quantity.toFixed(2)),
    }));

    let matDoc = null;
    if (materialItems.length > 0) {
      if (matDocExisting) {
        matDocExisting.items = materialItems;
        matDocExisting.created_by_user = created_by_user;
        matDoc = matDocExisting;
      } else {
        matDoc = new MaterialModel({ tender_id, items: materialItems, created_by_user });
      }
    }

    // 9. Calculate summary (siteOverheads already fetched in round 1)
    if (boq) {
      const s_zero_cost = Number(boq.zero_cost_total_amount || 0);
      const s_boq_total = Number(boq.boq_total_amount || 0);
      const siteoverhead_total_amount = Number(siteOverheads?.grand_total_overheads_rs || 0);
      const escalation_benefits_percentage = Number(siteOverheads?.escalation_benefits_percentage || 0);
      const risk_contingency = Number(siteOverheads?.risk_contingency || 0);
      const ho_overheads = Number(siteOverheads?.ho_overheads || 0);

      const total_cost = s_zero_cost + siteoverhead_total_amount;
      const margin = total_cost - s_boq_total;
      const total_margin = margin + (margin * escalation_benefits_percentage) / 100;
      const grossmargin_percentage = s_boq_total > 0 ? (total_margin * 100) / s_boq_total : 0;
      const PBT = grossmargin_percentage - risk_contingency - ho_overheads;

      doc.summary = {
        zero_cost_total_amount: s_zero_cost,
        siteoverhead_total_amount,
        total_cost,
        boq_total_amount: s_boq_total,
        margin,
        escalation_benefits_percentage,
        total_margin,
        grossmargin_percentage,
        risk_contingency,
        ho_overheads,
        PBT,
      };
    }

    // Round 2: all independent writes in parallel (4 DB saves → 1 round trip)
    await Promise.all([
      doc.save(),
      boq ? boq.save() : Promise.resolve(),
      raDoc.save(),
      matDoc ? matDoc.save() : Promise.resolve(),
    ]);

    return doc;
  }

  static async freezeRateAnalysis(tender_id) {
    const doc = await WorkItemModel.findOne({ tender_id });
    if (!doc) {
      throw new Error("Rate Analysis record not found for this tender. Please upload Rate Analysis data before freezing.");
    }
    doc.freeze = true;
    await doc.save();
  }

  static async updateSummaryAfterSiteOverhead(tender_id) {
    const [boq, siteOverheads, doc] = await Promise.all([
      BoqModel.findOne({ tender_id }),
      SiteOverheads.findOne({ tenderId: tender_id }),
      WorkItemModel.findOne({ tender_id }),
    ]);

    if (!boq) throw new Error("Bill of Quantities record not found for this tender. Summary recalculation could not be completed.");
    if (!siteOverheads) throw new Error("Site Overheads record not found for this tender. Summary recalculation could not be completed.");

    // Extract values
    const zero_cost_total_amount = Number(boq.zero_cost_total_amount || 0);
    const siteoverhead_total_amount = Number(siteOverheads.grand_total_overheads_rs || 0);
    const boq_total_amount = Number(boq.boq_total_amount || 0);

    // Calculate summary values
    const total_cost = zero_cost_total_amount + siteoverhead_total_amount;
    const margin = total_cost - boq_total_amount;
    const escalation_benefits_percentage = Number(siteOverheads.escalation_benefits_percentage || 0);
    const total_margin = margin + (margin * escalation_benefits_percentage) / 100;
    const grossmargin_percentage = boq_total_amount > 0 ? (total_margin * 100) / boq_total_amount : 0;
    const risk_contingency = Number(siteOverheads.risk_contingency || 0);
    const ho_overheads = Number(siteOverheads.ho_overheads || 0);
    const PBT = grossmargin_percentage - risk_contingency - ho_overheads;

    if (!doc) {
      throw new Error("Rate Analysis record not found for this tender. Please upload Rate Analysis data before updating the summary.");
    }

    doc.summary = {
      zero_cost_total_amount,
      siteoverhead_total_amount,
      total_cost,
      boq_total_amount,
      margin,
      escalation_benefits_percentage,
      total_margin,
      grossmargin_percentage,
      risk_contingency,
      ho_overheads,
      PBT,
    };

    await doc.save();
    return doc;
  }

  static async getSummary(tender_id) {
    const [doc, tender] = await Promise.all([
      WorkItemModel.findOne({ tender_id }),
      TenderModel.findOne({ tender_id }),
    ]);

    if (!doc) {
      throw new Error("Rate Analysis record not found for this tender.");
    }

    if (!tender) {
      throw new Error("Tender record not found for the specified Tender ID.");
    }
    const tenderdetails = {
      tender_id: tender.tender_id,
      tender_name: tender.tender_name,
      tender_project_name: tender.tender_project_name,
      tender_type: tender.tender_type,
      tender_status: tender.tender_status,
      tender_start_date: tender.tender_start_date,
      tender_end_date: tender.tender_end_date,
      tender_location: tender.tender_location,
      tender_description: tender.tender_description,
      client_name: tender.client_name
    };

    return {
      summary: doc.summary,
      tenderdetails,
      freeze: doc.freeze
    };
  }

}

export default WorkItemService;
