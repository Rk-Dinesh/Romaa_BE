import mongoose from "mongoose";
import WeeklyBillingModel from "./WeeklyBilling.model.js";
import WeeklyBillingTransactionModel from "./WeeklyBillingTransaction.model.js";
import BillCounterModel from "./WeeklyBillingCounter.model.js";

// ── Financial year helper ──────────────────────────────────────────────────────
// Apr–Mar Indian financial year.  Mar 2026 → "25-26",  Apr 2026 → "26-27"
function getFinYear(date = new Date()) {
  const yr = date.getFullYear();
  const mo = date.getMonth() + 1; // 1-12
  return mo >= 4
    ? `${String(yr).slice(2)}-${String(yr + 1).slice(2)}`   // "25-26"
    : `${String(yr - 1).slice(2)}-${String(yr).slice(2)}`;  // "24-25"
}

// ── Atomic bill sequence per tender × fin_year ─────────────────────────────────
// Uses findOneAndUpdate($inc) + upsert so concurrent requests can never get
// the same sequence number.
async function nextBillSeq(tender_id, finYear) {
  const key = `WB/${tender_id}/${finYear}`;
  const counter = await BillCounterModel.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq; // 1, 2, 3 …
}

// ── Bill number formatters ─────────────────────────────────────────────────────
// bill_no:     WB/TND-001/25-26/0001
// sub_bill_no: WB/TND-001/25-26/0001/S01
function buildBillNo(tender_id, finYear, seq) {
  return `WB/${tender_id}/${finYear}/${String(seq).padStart(4, "0")}`;
}

function buildSubBillNo(billNo, subIdx) {
  return `${billNo}/S${String(subIdx).padStart(2, "0")}`;
}

// ──────────────────────────────────────────────────────────────────────────────

class WeeklyBillingService {

  // ── 1. List all bills for a tender ──────────────────────────────────────────
  static async getBillingList(tenderId) {
    return await WeeklyBillingModel.find({ tender_id: tenderId })
      .sort({ createdAt: -1 })
      .lean();
  }

  // ── 2. Get a single bill with its line-item transactions ─────────────────────
  static async getBillDetail(billNo) {
    const bill = await WeeklyBillingModel.findOne({ bill_no: billNo }).lean();
    if (!bill) return null;

    const transactions = await WeeklyBillingTransactionModel
      .find({ bill_no: billNo })
      .sort({ sub_bill_no: 1 })
      .lean();

    return { ...bill, transactions };
  }

  // ── 3. Get transactions for a single sub-bill ────────────────────────────────
  static async getSubBillTransactions(subBillNo) {
    return await WeeklyBillingTransactionModel
      .find({ sub_bill_no: subBillNo })
      .lean();
  }

  // ── 4. Vendor work-done summary for a date range ─────────────────────────────
  // Aggregates WorkOrderDone records and groups them:
  //   vendor → work_order_id → { work_done_ids, items, sub_base_amount }
  //
  // Returns one entry per vendor, each having a sub_bills array ready to be
  // passed directly into generateBill.
  static async getContractorSummary(tenderId, fromDate, toDate) {
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

    // contractor_name → work_order_id → sub_bill draft
    const vendorMap = {};

    for (const rec of records) {
      const vName = rec.contractor_name  || "Unknown";
      const woId  = rec.workOrder_id || "NO_WO";
      const wdId  = String(rec._id);

      if (!vendorMap[vName]) {
        vendorMap[vName] = {
          contractor_name: vName,
          contractor_id:   rec.contractor_id || "",
          woMap:       {},
          base_amount: 0,
        };
      }

      const vendor = vendorMap[vName];

      if (!vendor.woMap[woId]) {
        vendor.woMap[woId] = {
          work_order_id:   woId,
          work_done_ids:   [],
          items:           [],
          sub_base_amount: 0,
        };
      }

      const subBill = vendor.woMap[woId];

      if (!subBill.work_done_ids.includes(wdId)) {
        subBill.work_done_ids.push(wdId);
      }

      for (const item of rec.dailyWorkDone || []) {
        const qty  = Number(item.quantity)    || 0;
        const rate = Number(item.quoted_rate) || 0;
        const amt  = qty * rate;

        subBill.sub_base_amount += amt;
        vendor.base_amount      += amt;

        subBill.items.push({
          work_order_id:    woId,
          work_done_id:     wdId,
          item_description: item.item_description || "",
          description:      item.description      || "",
          quantity:         qty,
          unit:             item.unit              || "",
          quoted_rate:      rate,
          amount:           amt,
        });
      }
    }

    return Object.values(vendorMap).map(({ woMap, ...vendor }) => ({
      ...vendor,
      sub_bills: Object.values(woMap),
    }));
  }

  // ── 5. Check for duplicate (overlapping date range for same vendor) ───────────
  static async checkDuplicateBill(tenderId, contractorName, fromDate, toDate) {
    return await WeeklyBillingModel.findOne({
      tender_id:   tenderId,
      contractor_name: contractorName,
      status:      { $ne: "Cancelled" },
      from_date:   { $lte: new Date(toDate) },
      to_date:     { $gte: new Date(fromDate) },
    }).lean();
  }

  // ── 6. Generate a new bill ────────────────────────────────────────────────────
  //
  // Expected payload:
  // {
  //   tender_id:   "TND-001",
  //   vendor_id:   "VND-001",
  //   vendor_name: "ABC Contractors",
  //   from_date:   "2025-03-10",
  //   to_date:     "2025-03-17",
  //   gst_pct:     18,
  //   sub_bills: [
  //     {
  //       work_order_id:   "WO-001",           // one WO per sub-bill
  //       work_done_ids:   ["wd1", "wd2"],      // WD records included
  //       items: [                              // line items from dailyWorkDone
  //         {
  //           work_order_id:    "WO-001",
  //           work_done_id:     "wd1",
  //           item_description: "Excavation",
  //           description:      "Zone A",
  //           quantity:         10,
  //           unit:             "cum",
  //           quoted_rate:      500,
  //           amount:           5000,
  //         }
  //       ],
  //       sub_base_amount: 5000,  // optional — computed from items if omitted
  //     }
  //   ],
  //   created_by: "Site Engineer",
  // }
  static async generateBill(payload) {
    const {
      tender_id,
      contractor_id,
      contractor_name,
      from_date,
      to_date,
      gst_pct    = 0,
      sub_bills  = [],
      created_by = "Site Engineer",
    } = payload;

    // Duplicate check
    const existing = await WeeklyBillingService.checkDuplicateBill(
      tender_id, contractor_name, from_date, to_date
    );
    if (existing) {
      const err = new Error(
        `Bill ${existing.bill_no} already exists for ${contractor_name} covering this date range.`
      );
      err.statusCode = 409;
      throw err;
    }

    // Generate bill_no atomically
    const finYear  = getFinYear();
    const seq      = await nextBillSeq(tender_id, finYear);
    const bill_no  = buildBillNo(tender_id, finYear, seq);

    // Build sub_bill summaries and collect all transaction docs
    let base_amount  = 0;
    const builtSubBills    = [];
    const transactionDocs  = [];

    sub_bills.forEach((sb, idx) => {
      const sub_bill_no = buildSubBillNo(bill_no, idx + 1);

      // Compute sub_base_amount from items if not explicitly provided
      const sub_base_amount =
        sb.sub_base_amount != null
          ? Number(sb.sub_base_amount)
          : (sb.items || []).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

      base_amount += sub_base_amount;

      // Sub-bill summary (no items — items go to WeeklyBillingTransaction)
      builtSubBills.push({
        sub_bill_no,
        work_order_id:   sb.work_order_id   || "",
        work_done_ids:   sb.work_done_ids   || [],
        sub_base_amount,
      });

      // One transaction document per line item
      for (const item of sb.items || []) {
        transactionDocs.push({
          bill_no,
          sub_bill_no,
          tender_id,
          contractor_id,
          contractor_name,
          fin_year:         finYear,
          from_date:        new Date(from_date),
          to_date:          new Date(to_date),
          work_order_id:    item.work_order_id  || sb.work_order_id || "",
          work_done_id:     item.work_done_id   || "",
          item_description: item.item_description || "",
          description:      item.description      || "",
          quantity:         Number(item.quantity)    || 0,
          unit:             item.unit               || "",
          quoted_rate:      Number(item.quoted_rate) || 0,
          amount:           Number(item.amount)      || 0,
          status:           "Generated",
        });
      }
    });

    const gst_amount   = parseFloat(((base_amount * Number(gst_pct)) / 100).toFixed(2));
    const total_amount = parseFloat((base_amount + gst_amount).toFixed(2));

    // Save the bill header (fin_year is auto-set by model pre-save hook)
    const bill = await new WeeklyBillingModel({
      bill_no,
      bill_date:    new Date(),
      tender_id,
      contractor_id,
      contractor_name,
      from_date:    new Date(from_date),
      to_date:      new Date(to_date),
      sub_bills:    builtSubBills,
      base_amount,
      gst_pct:      Number(gst_pct),
      gst_amount,
      total_amount,
      created_by,
    }).save();

    // Bulk insert all line items into the transactions collection
    if (transactionDocs.length) {
      await WeeklyBillingTransactionModel.insertMany(transactionDocs, { ordered: false });
    }

    return bill;
  }

  // ── 7. Update bill status ─────────────────────────────────────────────────────
  // Also syncs status to all child transactions so queries on transactions
  // can filter by status without joining the parent.
  static async updateBillStatus(billId, status) {
    const allowed = ["Generated", "Pending", "Paid", "Cancelled"];
    if (!allowed.includes(status)) {
      const err = new Error(`Invalid status. Allowed: ${allowed.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }

    const updated = await WeeklyBillingModel.findByIdAndUpdate(
      billId,
      { status },
      { new: true }
    ).lean();

    if (updated) {
      // Keep transactions in sync — no join needed for transaction-level queries
      await WeeklyBillingTransactionModel.updateMany(
        { bill_no: updated.bill_no },
        { status }
      );
    }

    return updated;
  }
}

export default WeeklyBillingService;
