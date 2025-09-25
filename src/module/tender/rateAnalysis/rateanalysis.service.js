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
}

export default WorkItemService;
