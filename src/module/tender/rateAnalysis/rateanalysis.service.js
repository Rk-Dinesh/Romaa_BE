import WorkItemModel from "./rateanalysis.model.js";
import csvParser from "csv-parser";
import fs from "fs";
import BoqModel from "../boq/boq.model.js";

function groupLinesByCategory(lines) {
  // Group lines by 'category'
  const groups = {};
  for (const line of lines) {
    const { category, ...rest } = line;
    if (!groups[category]) groups[category] = [];
    groups[category].push(rest);
  }
  return Object.entries(groups).map(([category, sub]) => ({ category, sub }));
}

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

  static async bulkInsert1(csvRows, tender_id) {
    // Group rows by itemNo and workItem
    const groupedByItem = {};
    csvRows.forEach((row) => {
      const itemKey = row.itemNo;
      if (!groupedByItem[itemKey]) {
        groupedByItem[itemKey] = {
          itemNo: Number(row.itemNo),
          workItem: row.workItem,
          unit: null,
          output: null,
          finalRate: null,
          linesByCategory: {},
        };
      }

      const item = groupedByItem[itemKey];

      // Normalize category name, just in case, to uppercase and underscores for consistency
      let category = row.category
        ? row.category.toUpperCase().replace(/\s+/g, "_")
        : "";

      if (category === "MAIN_ITEM" || category === "MAINITEM") {
        // Main item line gives unit, output, finalRate for work item
        item.unit = row.unit || null;
        item.output =
          row.output !== undefined && row.output !== ""
            ? Number(row.output)
            : null;
        item.finalRate =
          row.finalRate !== undefined && row.finalRate !== ""
            ? Number(row.finalRate)
            : null;
      } else if (category) {
        // Other categories grouped by category
        if (!item.linesByCategory[category]) {
          item.linesByCategory[category] = [];
        }
        // Push line with full field set
        item.linesByCategory[category].push({
          description: row.description || "",
          unit: row.unit || "",
          quantity:
            row.quantity !== undefined && row.quantity !== ""
              ? Number(row.quantity)
              : null,
          output:
            row.output !== undefined && row.output !== ""
              ? Number(row.output)
              : null,
          rate:
            row.rate !== undefined && row.rate !== "" ? Number(row.rate) : null,
          amount:
            row.amount !== undefined && row.amount !== ""
              ? Number(row.amount)
              : null,
          finalRate:
            row.finalRate !== undefined && row.finalRate !== ""
              ? Number(row.finalRate)
              : null,
        });
      }
    });

    const workItems = Object.values(groupedByItem).map((item) => {
      const lines =
        item.linesByCategory && typeof item.linesByCategory === "object"
          ? Object.entries(item.linesByCategory).map(([category, subs]) => ({
            category,
            sub: Array.isArray(subs) ? subs : [],
          }))
          : [];

      return {
        itemNo: item.itemNo,
        workItem: item.workItem,
        unit: item.unit,
        output: item.output,
        finalRate: item.finalRate,
        lines,
      };
    });

    // Upsert the document for tender_id
    const updatedDoc = await WorkItemModel.findOneAndUpdate(
      { tender_id },
      { tender_id, work_items: workItems },
      { upsert: true, new: true }
    );

    // Return work_items in expected nested format
    return updatedDoc.work_items;
  }

  static parseWorkItemsFromCSV(csvRows) {
    const groupedByItem = {};
    csvRows.forEach((row) => {
      const itemKey = row.itemNo;
      if (!groupedByItem[itemKey]) {
        groupedByItem[itemKey] = {
          itemNo: Number(row.itemNo),
          workItem: row.workItem,
          unit: null,
          output: null,
          finalRate: null,
          linesByCategory: {},
        };
      }
      const item = groupedByItem[itemKey];
      let category = row.category
        ? row.category.toUpperCase().replace(/\s+/g, "_")
        : "";

      if (category === "MAIN_ITEM" || category === "MAINITEM") {
        item.unit = row.unit || null;
        item.output =
          row.output !== undefined && row.output !== ""
            ? Number(row.output)
            : null;
        item.finalRate =
          row.finalRate !== undefined && row.finalRate !== ""
            ? Number(row.finalRate)
            : null;
      } else if (category) {
        if (!item.linesByCategory[category])
          item.linesByCategory[category] = [];
        item.linesByCategory[category].push({
          description: row.description || "",
          unit: row.unit || "",
          quantity:
            row.quantity !== undefined && row.quantity !== ""
              ? Number(row.quantity)
              : null,
          output:
            row.output !== undefined && row.output !== ""
              ? Number(row.output)
              : null,
          rate:
            row.rate !== undefined && row.rate !== "" ? Number(row.rate) : null,
          amount:
            row.amount !== undefined && row.amount !== ""
              ? Number(row.amount)
              : null,
          finalRate:
            row.finalRate !== undefined && row.finalRate !== ""
              ? Number(row.finalRate)
              : null,
        });
      }
    });

    return Object.values(groupedByItem).map((item) => {
      const lines =
        item.linesByCategory && typeof item.linesByCategory === "object"
          ? Object.entries(item.linesByCategory).map(([category, subs]) => ({
            category,
            sub: Array.isArray(subs) ? subs : [],
          }))
          : [];
      return {
        itemNo: item.itemNo,
        workItem: item.workItem,
        unit: item.unit,
        output: item.output,
        finalRate: item.finalRate,
        lines,
      };
    });
  }

  static async bulkInsert2(csvRows, tender_id) {
    const workItems = WorkItemService.parseWorkItemsFromCSV(csvRows);

    // Upsert work items
    await WorkItemModel.findOneAndUpdate(
      { tender_id },
      { tender_id, work_items: workItems },
      { upsert: true, new: true }
    );

    return workItems;
  }

  static async syncBoqWithWorkItems(tender_id, workItems) {
    const boqDoc = await BoqModel.findOne({ tender_id });
    if (!boqDoc) throw new Error("Matching BOQ not found");

    boqDoc.items.forEach((boqItem) => {
      const workItem = workItems.find(
        (wi) =>
          wi.workItem &&
          boqItem.item_name &&
          wi.workItem.trim().toLowerCase() ===
          boqItem.item_name.trim().toLowerCase()
      );
      if (!workItem) return;

      const getCatSub = (cat) => {
        const l = workItem.lines.find((l) => l.category === cat);
        return l && l.sub && l.sub.length > 0 ? l.sub[0] : null;
      };

      // Map categories to BOQ fields
      const catFields = [
        { cat: "MATERIALS", f: "material", af: "material_amount" },
        { cat: "FUEL", f: "fuel", af: "fuel_amount" },
        { cat: "MACHINERIES", f: "machinery", af: "machinery_amount" },
        { cat: "MANPOWER", f: "labor", af: "labor_amount" },
        {
          cat: "SUBCONTRACTOR",
          f: "subcontractor",
          af: "subcontractor_amount",
        },
      ];

      catFields.forEach(({ cat, f, af }) => {
        const val = getCatSub(cat);
        if (val) {
          boqItem[f] =
            val.finalRate !== undefined && val.finalRate !== null
              ? String(val.finalRate)
              : "";
          boqItem[af] =
            boqItem.quantity &&
              val.finalRate !== undefined &&
              val.finalRate !== null
              ? String(Number(boqItem.quantity) * Number(val.finalRate))
              : "";
        }
      });

      boqItem.zero_cost_unit_rate =
        workItem.finalRate !== undefined && workItem.finalRate !== null
          ? String(workItem.finalRate)
          : "";
      boqItem.zero_cost_final_amount =
        boqItem.quantity && boqItem.zero_cost_unit_rate
          ? String(
            Number(boqItem.quantity) * Number(boqItem.zero_cost_unit_rate)
          )
          : "";
    });

    await boqDoc.save();
    return boqDoc;
  }
  //one 
  //  static async bulkInsertWorkItemsFromCsv(csvRows, tender_id) {
  //   // 1. Load BOQ once and map item_id -> description
  //   const boq = await BoqModel.findOne({ tender_id }).lean();
  //   const boqMap = new Map();
  //   if (boq?.items?.length) {
  //     for (const item of boq.items) {
  //       if (!item?.item_id) continue;
  //       boqMap.set(String(item.item_id).trim(), item.description || "");
  //     }
  //   }

  //   // 2. Group CSV rows by itemNo, separating MAIN_ITEM and detail rows
  //   const grouped = new Map(); // itemNo -> { mainRow, detailRows: [] }

  //   for (const rawRow of csvRows) {
  //     if (!rawRow) continue;

  //     const itemNo = rawRow.itemNo != null ? String(rawRow.itemNo).trim() : "";
  //     if (!itemNo) continue;

  //     const category = rawRow.category != null ? String(rawRow.category).trim() : "";

  //     let entry = grouped.get(itemNo);
  //     if (!entry) {
  //       entry = { mainRow: null, detailRows: [] };
  //       grouped.set(itemNo, entry);
  //     }

  //     if (category === "MAIN_ITEM") {
  //       entry.mainRow = rawRow;
  //     } else {
  //       entry.detailRows.push(rawRow);
  //     }
  //   }

  //   // 3. Build work_items array
  //   const work_items = [];

  //   for (const [itemNo, { mainRow, detailRows }] of grouped.entries()) {
  //     if (!mainRow) continue; // skip groups without MAIN_ITEM

  //     const working_quantity = Number(mainRow.working_quantity || 0);
  //     const unit = mainRow.unit || null;

  //     // workItem text from BOQ; fallback to MAIN_ITEM description or generic label
  //     const workItem =
  //       boqMap.get(itemNo) ||
  //       (mainRow.description || "").trim() ||
  //       `Item ${itemNo}`;

  //     const lines = [];
  //     const categoryTotals = {
  //       "MT-CM": 0,
  //       "MT-BL": 0,
  //       "MY-M": 0,
  //       "MY-F": 0,
  //       "MP-C": 0,
  //       "MP-NMR": 0
  //     };

  //     for (const rawRow of detailRows) {
  //       const category =
  //         rawRow.category != null ? String(rawRow.category).trim() : "";

  //       const quantity = Number(
  //         rawRow.working_quantity != null ? rawRow.working_quantity : rawRow.quantity || 0
  //       );
  //       const rate = Number(rawRow.rate || 0);
  //       const amount = quantity * rate;
  //       const total_rate =
  //         working_quantity > 0
  //           ? Number((amount / working_quantity).toFixed(4))
  //           : 0;

  //       const line = {
  //         category,
  //         description: rawRow.description || "",
  //         unit: rawRow.unit || "",
  //         quantity,
  //         rate,
  //         amount,
  //         total_rate
  //       };

  //       lines.push(line);

  //       if (Object.prototype.hasOwnProperty.call(categoryTotals, category)) {
  //         categoryTotals[category] += total_rate;
  //       }
  //     }

  //     // Round category rates to 2 decimals
  //     const MT_CM_rate = Number(categoryTotals["MT-CM"].toFixed(2));
  //     const MT_BL_rate = Number(categoryTotals["MT-BL"].toFixed(2));
  //     const MY_M_rate = Number(categoryTotals["MY-M"].toFixed(2));
  //     const MY_F_rate = Number(categoryTotals["MY-F"].toFixed(2));
  //     const MP_C_rate = Number(categoryTotals["MP-C"].toFixed(2));
  //     const MP_NMR_rate = Number(categoryTotals["MP-NMR"].toFixed(2));

  //     const final_rate_raw =
  //       MT_CM_rate +
  //       MT_BL_rate +
  //       MY_M_rate +
  //       MY_F_rate +
  //       MP_C_rate +
  //       MP_NMR_rate;

  //     const final_rate = Number(final_rate_raw.toFixed(2));

  //     work_items.push({
  //       itemNo,
  //       workItem,
  //       unit,
  //       working_quantity,
  //       category: "MAIN_ITEM",
  //       MT_CM_rate,
  //       MT_BL_rate,
  //       MY_M_rate,
  //       MY_F_rate,
  //       MP_C_rate,
  //       MP_NMR_rate,
  //       final_rate,
  //       lines
  //     });
  //   }

  //   // 4. Upsert WorkItems document for this tender
  //   let doc = await WorkItemModel.findOne({ tender_id });

  //   if (doc) {
  //     doc.work_items = work_items;
  //   } else {
  //     doc = new WorkItemModel({
  //       tender_id,
  //       work_items
  //     });
  //   }

  //   await doc.save();
  //   return doc;
  // }

static async bulkInsertWorkItemsFromCsv(csvRows, tender_id) {
  // 1. Load BOQ once
  const boq = await BoqModel.findOne({ tender_id });
  const boqItems = boq?.items || [];

  // Map item_id -> boq item (reference)
  const boqById = new Map();
  for (const item of boqItems) {
    if (!item?.item_id) continue;
    boqById.set(String(item.item_id).trim(), item);
  }

  // 2. Group CSV rows by itemNo
  const grouped = new Map(); // itemNo -> { mainRow, detailRows: [] }

  for (const rawRow of csvRows) {
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

  // 3. Build work_items array and in same loop compute/update BOQ per item
  const work_items = [];

  // BOQ totals accumulators
  let boq_total_amount = 0;
  let zero_cost_total_amount = 0;
  let variance_amount_total = 0;
  let variance_percentage_total = 0;
  let consumable_material_total = 0;
  let bulk_material_total = 0;
  let machinery_total = 0;
  let fuel_total = 0;
  let contractor_total = 0;
  let nmr_total = 0;

  for (const [itemNo, { mainRow, detailRows }] of grouped.entries()) {
    if (!mainRow) continue;

    const working_quantity = Number(mainRow.working_quantity || 0);
    const unit = mainRow.unit || null;

    // workItem text from BOQ; fallback to MAIN_ITEM description or generic label
    const boqItem = boqById.get(itemNo);
    const workItem =
      (boqItem?.description || "").trim() ||
      (mainRow.description || "").trim() ||
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
        rawRow.category != null ? String(rawRow.category).trim() : "";

      const quantity = Number(
        rawRow.working_quantity != null
          ? rawRow.working_quantity
          : rawRow.quantity || 0
      );
      const rate = Number(rawRow.rate || 0);
      const amount = quantity * rate;
      const total_rate =
        working_quantity > 0
          ? Number((amount / working_quantity).toFixed(4))
          : 0;

      const line = {
        category,
        description: rawRow.description || "",
        unit: rawRow.unit || "",
        quantity,
        rate,
        amount,
        total_rate
      };

      lines.push(line);

      if (Object.prototype.hasOwnProperty.call(categoryTotals, category)) {
        categoryTotals[category] += total_rate;
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
      const quantity = Number(boqItem.quantity || 0);
      const n_rate = Number(boqItem.n_rate || 0);
      const n_amount = Number(
        boqItem.n_amount != null ? boqItem.n_amount : quantity * n_rate || 0
      );

      const consumable_material_rate = MT_CM_rate;
      const consumable_material_amount = Number(
        (quantity * consumable_material_rate).toFixed(2)
      );

      const bulk_material_rate = MT_BL_rate;
      const bulk_material_amount = Number(
        (quantity * bulk_material_rate).toFixed(2)
      );

      const machinery_rate = MY_M_rate;
      const machinery_amount = Number(
        (quantity * machinery_rate).toFixed(2)
      );

      const fuel_rate = MY_F_rate;
      const fuel_amount = Number((quantity * fuel_rate).toFixed(2));

      const contractor_rate = MP_C_rate;
      const contractor_amount = Number(
        (quantity * contractor_rate).toFixed(2)
      );

      const nmr_rate = MP_NMR_rate;
      const nmr_amount = Number((quantity * nmr_rate).toFixed(2));

      const final_rate_item = final_rate; // already 2 decimals
      const final_amount = Number(
        (quantity * final_rate_item).toFixed(2)
      );

      const variance_amount = Number(
        (final_amount - n_amount).toFixed(2)
      );
      const variance_percentage =
        n_amount > 0
          ? Number(((final_amount/n_amount) * 100).toFixed(2))
          : 0;

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

      // accumulate BOQ totals
      boq_total_amount += n_amount;
      zero_cost_total_amount += final_amount;
      variance_amount_total += variance_amount;
      // variance_percentage_total += variance_percentage;
      consumable_material_total += consumable_material_amount;
      bulk_material_total += bulk_material_amount;
      machinery_total += machinery_amount;
      fuel_total += fuel_amount;
      contractor_total += contractor_amount;
      nmr_total += nmr_amount;
    }
  }

  // 5. Upsert WorkItems document for this tender
  let doc = await WorkItemModel.findOne({ tender_id });

  if (doc) {
    doc.work_items = work_items;
  } else {
    doc = new WorkItemModel({
      tender_id,
      work_items
    });
  }

  await doc.save();

  // 6. If BOQ exists, update BOQ totals once
  if (boq) {
    const total_material_amount = consumable_material_total + bulk_material_total;
    const total_machine_amount = machinery_total + fuel_total;
    const total_labor_amount = contractor_total + nmr_total;

    boq.boq_total_amount = Number(boq_total_amount.toFixed(2));
    boq.zero_cost_total_amount = Number(
      zero_cost_total_amount.toFixed(2)
    );
    boq.variance_amount = Number(variance_amount_total.toFixed(2));
    boq.variance_percentage = Number(
      (zero_cost_total_amount/boq_total_amount) * 100
    );
    boq.consumable_material = Number(
      consumable_material_total.toFixed(2)
    );
    boq.bulk_material = Number(bulk_material_total.toFixed(2));
    boq.total_material_amount = Number(
      total_material_amount.toFixed(2)
    );
    boq.machinery = Number(machinery_total.toFixed(2));
    boq.fuel = Number(fuel_total.toFixed(2));
    boq.total_machine_amount = Number(
      total_machine_amount.toFixed(2)
    );
    boq.contractor = Number(contractor_total.toFixed(2));
    boq.nmr = Number(nmr_total.toFixed(2));
    boq.total_labor_amount = Number(
      total_labor_amount.toFixed(2)
    );

    await boq.save();
  }

  return doc;
}



}

export default WorkItemService;
