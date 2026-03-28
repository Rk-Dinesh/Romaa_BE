import mongoose from "mongoose";
import BillingEstimateModel from "./billingestimate.model.js";
import BillingModel from "../clientbilling/clientbilling.model.js";

class BillingEstimateService {

  // ── Hierarchy Level Detector ──────────────────────────────────────────────
  static getLevelFromCode(code) {
    if (!code) return 0;
    code = code.toString().trim();
    if (/^Day/i.test(code))                   return 1.5; // Day-1
    if (/^[A-Z]{2,}[\s\-_]?\d+$/i.test(code)) return 1;  // ID001
    if (/^[A-Z]$/i.test(code))                return 2;  // A, B
    if (/^\d+(\.\d+)?$/.test(code))           return 3;  // 1, 1.1
    return 0;
  }

  // ── Upload CSV estimate and link to an existing bill ──────────────────────
  // bill_id is REQUIRED — must match an existing client bill (CB/25-26/0001)
  // abstract_name differentiates estimate types for the same bill
  static async bulkInsert(csvRows, tender_id, bill_id, abstract_name, created_by_user) {
    if (!bill_id) throw new Error("bill_id is required — create a Client Bill first, then upload its estimate");
    if (!abstract_name) throw new Error("abstract_name is required (e.g. 'Abstract Estimate', 'Steel Estimate')");

    // Verify the bill exists and belongs to this tender
    const bill = await BillingModel.findOne({ bill_id, tender_id }).lean();
    if (!bill) {
      throw new Error(`Bill '${bill_id}' not found for tender '${tender_id}'. Create the bill first.`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // ── CSV Processing ────────────────────────────────────────────────────
      const getValue = (row, key) =>
        (row[key] || row[key.toLowerCase()] || row[key.toUpperCase()] || "").toString().trim();

      const safeNum = (val) => {
        if (!val || val === "-" || val === "" || val === ".") return 0;
        const n = Number(val);
        return isNaN(n) ? 0 : n;
      };

      const items = [];
      let currentWorkItem = null;
      let currentDetail   = null;
      let activeDay       = "";

      for (const row of csvRows) {
        const code = getValue(row, "Code");
        if (!code) continue;

        const level = this.getLevelFromCode(code);
        const desc  = getValue(row, "Description");
        const unit  = getValue(row, "Unit");

        const nos1 = getValue(row, "Nos1");
        const x    = getValue(row, "X");
        const nos2 = getValue(row, "Nos2");
        const nos  = nos2 ? `${nos1}${x}${nos2}` : nos1;

        const length    = safeNum(getValue(row, "Length"));
        const breadth   = safeNum(getValue(row, "Breadth"));
        const depth     = safeNum(getValue(row, "Depth"));
        const qty       = safeNum(getValue(row, "Quantity"));
        const mb_book_ref = getValue(row, "Mbook");

        if (level === 1.5) { activeDay = code; continue; }

        if (level === 1) {
          currentWorkItem = { item_code: code, item_name: desc, day: activeDay, unit, quantity: qty, mb_book_ref, details: [] };
          items.push(currentWorkItem);
          currentDetail = null;
        } else if (level === 2) {
          if (!currentWorkItem) continue;
          currentDetail = { description: desc, nos, length, breadth, depth, quantity: qty, details: [] };
          currentWorkItem.details.push(currentDetail);
        } else if (level === 3) {
          const sub = { description: desc, nos, length, breadth, depth, quantity: qty };
          if (currentDetail) {
            currentDetail.details.push(sub);
          } else if (currentWorkItem) {
            currentDetail = { description: "General", details: [] };
            currentWorkItem.details.push(currentDetail);
            currentDetail.details.push(sub);
          }
        }
      }

      // ── Upsert estimate document ──────────────────────────────────────────
      let targetDoc = await BillingEstimateModel.findOne({
        tender_id,
        bill_id,
        abstract_name,
      }).session(session);

      if (targetDoc) {
        targetDoc.items = items;
        await targetDoc.save({ session });
      } else {
        targetDoc = new BillingEstimateModel({
          tender_id,
          bill_id,
          bill_sequence:  bill.bill_sequence,
          abstract_name,
          created_by_user: created_by_user || "",
          items,
        });
        await targetDoc.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        message: `'${abstract_name}' uploaded for bill ${bill_id}. Items: ${items.length}`,
        data: targetDoc,
      };

    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  }

  // ── Get a specific estimate document ─────────────────────────────────────
  static async getDetailedBill(tender_id, bill_id, abstract_name, bill_sequence) {
    return await BillingEstimateModel.findOne({
      tender_id,
      bill_id,
      abstract_name,
      bill_sequence: Number(bill_sequence),
    }).lean();
  }

  // ── List all estimate documents for a bill ────────────────────────────────
  static async getEstimatesForBill(tender_id, bill_id) {
    return await BillingEstimateModel.find({ tender_id, bill_id })
      .select("bill_id bill_sequence abstract_name createdAt")
      .sort({ abstract_name: 1 })
      .lean();
  }
}

export default BillingEstimateService;
