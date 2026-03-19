import mongoose from "mongoose";
import WeeklyBillingModel from "./WeeklyBilling.model.js";

class WeeklyBillingService {

  // ── 1. List all bills for a tender ──────────────────────────────────────────
  static async getBillingList(tenderId) {
    return await WeeklyBillingModel.find({ tender_id: tenderId })
      .sort({ createdAt: -1 })
      .lean();
  }

  // ── 2. Vendor work-done summary for a date range ────────────────────────────
  // Aggregates WorkOrderDone records in [fromDate, toDate] for the tender,
  // groups by vendor_name, and computes base_amount per vendor.
  static async getVendorSummary(tenderId, fromDate, toDate) {
    // Use the registered model to avoid re-defining if already registered
    let WOD;
    try {
      WOD = mongoose.model("WorkOrderDone");
    } catch {
      const schema = new mongoose.Schema({}, { strict: false });
      WOD = mongoose.model("WorkOrderDone", schema, "workorderdones");
    }

    const from = new Date(fromDate);
    const to   = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    const records = await WOD.find({
      tender_id:   tenderId,
      report_date: { $gte: from, $lte: to },
    }).lean();

    if (!records.length) return [];

    // Group by vendor_name
    const vendorMap = {};

    for (const rec of records) {
      const vName = rec.vendor_name || "Unknown";

      if (!vendorMap[vName]) {
        vendorMap[vName] = {
          vendor_name:    vName,
          base_amount:    0,
          work_order_ids: [],
          work_done_ids:  [],
          items:          [],
        };
      }

      const entry = vendorMap[vName];

      if (rec.workOrder_id && !entry.work_order_ids.includes(rec.workOrder_id)) {
        entry.work_order_ids.push(rec.workOrder_id);
      }

      if (rec._id) {
        entry.work_done_ids.push(String(rec._id));
      }

      for (const item of rec.dailyWorkDone || []) {
        const qty  = Number(item.quantity)    || 0;
        const rate = Number(item.quoted_rate) || 0;
        const amt  = qty * rate;

        entry.base_amount += amt;

        entry.items.push({
          work_order_id:    rec.workOrder_id || "",
          item_description: item.item_description || "",
          description:      item.description || "",
          quantity:         qty,
          unit:             item.unit || "",
          quoted_rate:      rate,
          amount:           amt,
        });
      }
    }

    return Object.values(vendorMap);
  }

  // ── 3. Check if vendor is already billed for an overlapping date range ───────
  static async checkDuplicateBill(tenderId, vendorName, fromDate, toDate) {
    return await WeeklyBillingModel.findOne({
      tender_id:   tenderId,
      vendor_name: vendorName,
      status:      { $ne: "Cancelled" },
      from_date:   { $lte: new Date(toDate) },
      to_date:     { $gte: new Date(fromDate) },
    }).lean();
  }

  // ── 4. Generate a new bill ───────────────────────────────────────────────────
  static async generateBill(payload) {
    const {
      tender_id,
      vendor_name,
      from_date,
      to_date,
      base_amount,
      gst_pct,
      gst_amount,
      total_amount,
      work_order_ids,
      work_done_ids,
      items,
      created_by,
    } = payload;

    const existing = await WeeklyBillingService.checkDuplicateBill(
      tender_id, vendor_name, from_date, to_date
    );
    if (existing) {
      const err = new Error(
        `Bill ${existing.bill_no} already exists for ${vendor_name} covering this date range.`
      );
      err.statusCode = 409;
      throw err;
    }

    const bill = new WeeklyBillingModel({
      tender_id,
      vendor_name,
      from_date:      new Date(from_date),
      to_date:        new Date(to_date),
      base_amount:    Number(base_amount)  || 0,
      gst_pct:        Number(gst_pct)      || 0,
      gst_amount:     Number(gst_amount)   || 0,
      total_amount:   Number(total_amount) || 0,
      work_order_ids: work_order_ids || [],
      work_done_ids:  work_done_ids  || [],
      items:          items          || [],
      created_by:     created_by     || "Site Engineer",
    });

    return await bill.save();
  }

  // ── 5. Update bill status ────────────────────────────────────────────────────
  static async updateBillStatus(billId, status) {
    const allowed = ["Generated", "Pending", "Paid", "Cancelled"];
    if (!allowed.includes(status)) {
      const err = new Error(`Invalid status. Allowed: ${allowed.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }
    return await WeeklyBillingModel.findByIdAndUpdate(
      billId,
      { status },
      { new: true }
    ).lean();
  }
}

export default WeeklyBillingService;
