import RentalAgreementModel from "./rentalagreement.model.js";
import RentalInvoiceModel from "./rentalinvoice.model.js";
import MachineDailyLog from "../machinerylogs/machinerylogs.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import { AppError } from "../../../common/AppError.js";

class RentalService {
  // ── Agreements ─────────────────────────────────────────────────────────
  static async createAgreement(data, userId) {
    const agreement_id = data.agreement_id || (await IdcodeServices.generateCode("RENTAL_AGREEMENT"));
    return RentalAgreementModel.create({ ...data, agreement_id, created_by: userId });
  }

  static async listAgreements(query = {}) {
    const { page = 1, limit = 20, direction, status, asset_id_label, counterparty_id } = query;
    const filter = {};
    if (direction) filter.direction = direction;
    if (status) filter.status = status;
    if (asset_id_label) filter.asset_id_label = asset_id_label;
    if (counterparty_id) filter.counterparty_id = counterparty_id;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      RentalAgreementModel.find(filter).sort({ start_date: -1 }).skip(skip).limit(Number(limit)),
      RentalAgreementModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } };
  }

  static async getAgreement(agreement_id) {
    const a = await RentalAgreementModel.findOne({ agreement_id });
    if (!a) throw new AppError("Agreement not found", 404);
    return a;
  }

  static async updateAgreement(agreement_id, data, userId) {
    data.updated_by = userId;
    const a = await RentalAgreementModel.findOneAndUpdate({ agreement_id }, data, { new: true, runValidators: true });
    if (!a) throw new AppError("Agreement not found", 404);
    return a;
  }

  // ── Invoices ───────────────────────────────────────────────────────────
  static async generateInvoice({ agreement_id, period_start, period_end }, userId) {
    const agreement = await RentalAgreementModel.findOne({ agreement_id });
    if (!agreement) throw new AppError("Agreement not found", 404);

    const start = new Date(period_start);
    const end   = new Date(period_end);
    if (!(start < end)) throw new AppError("period_end must be after period_start", 400);
    const period_label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;

    const existing = await RentalInvoiceModel.findOne({ agreement_ref: agreement._id, period_label });
    if (existing) return existing;

    // For machinery, pull usage from MachineDailyLog
    let hours_used = 0;
    let kms_used = 0;
    if (agreement.asset_kind === "MACHINERY") {
      const logs = await MachineDailyLog.find({
        assetId: agreement.asset_ref,
        logDate: { $gte: start, $lte: end },
      }).lean();
      hours_used = logs.reduce((s, l) => s + (l.netUsage || 0), 0);
      kms_used   = hours_used; // same field for KILOMETERS-tracked assets
    }
    const days_used = Math.max(1, Math.round((end - start) / 86400000));

    let base_amount = 0;
    if (agreement.pricing_basis === "PER_DAY")   base_amount = days_used  * agreement.rate;
    if (agreement.pricing_basis === "PER_MONTH") base_amount = agreement.rate;
    if (agreement.pricing_basis === "PER_HOUR")  base_amount = hours_used * agreement.rate;
    if (agreement.pricing_basis === "PER_KM")    base_amount = kms_used   * agreement.rate;

    // Apply minimum & free-hour cap on PER_HOUR
    let overtime_amount = 0;
    if (agreement.pricing_basis === "PER_HOUR" && agreement.free_hours_per_month) {
      const billable = Math.max(0, hours_used - agreement.free_hours_per_month);
      base_amount    = agreement.free_hours_per_month * agreement.rate;
      overtime_amount = billable * (agreement.overtime_rate || agreement.rate);
    }
    if (base_amount + overtime_amount < (agreement.minimum_per_month || 0)) {
      base_amount = agreement.minimum_per_month;
      overtime_amount = 0;
    }

    const taxable_amount = base_amount + overtime_amount;
    const gst_amount = Number((taxable_amount * (agreement.gst_pct || 0) / 100).toFixed(2));
    const total_amount = Number((taxable_amount + gst_amount).toFixed(2));

    const invoice_id = await IdcodeServices.generateCode("RENTAL_INVOICE");
    const inv = await RentalInvoiceModel.create({
      invoice_id,
      agreement_ref: agreement._id,
      agreement_no: agreement.agreement_id,
      direction: agreement.direction,
      asset_id_label: agreement.asset_id_label,
      asset_name: agreement.asset_name,
      counterparty_id: agreement.counterparty_id,
      counterparty_name: agreement.counterparty_name,
      projectId: agreement.projectId,
      period_start: start,
      period_end: end,
      period_label,
      days_used, hours_used, kms_used,
      base_amount, overtime_amount,
      taxable_amount, gst_amount, total_amount,
      status: "DRAFT",
      created_by: userId,
    });
    return inv;
  }

  static async listInvoices(query = {}) {
    const { page = 1, limit = 20, direction, status, agreement_no, period_label } = query;
    const filter = {};
    if (direction)    filter.direction = direction;
    if (status)       filter.status = status;
    if (agreement_no) filter.agreement_no = agreement_no;
    if (period_label) filter.period_label = period_label;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      RentalInvoiceModel.find(filter).sort({ period_start: -1 }).skip(skip).limit(Number(limit)),
      RentalInvoiceModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } };
  }

  static async finalizeInvoice(invoice_id, userId) {
    const inv = await RentalInvoiceModel.findOne({ invoice_id });
    if (!inv) throw new AppError("Invoice not found", 404);
    if (inv.status !== "DRAFT") throw new AppError(`Cannot finalize ${inv.status} invoice`, 400);
    inv.status = "FINALIZED";
    inv.updated_by = userId;
    await inv.save();
    return inv;
  }

  // P&L per asset (revenue from outgoing − cost from incoming)
  static async getAssetPnl({ asset_id_label, from, to }) {
    const filter = { asset_id_label, status: { $in: ["FINALIZED", "INVOICED", "PAID"] } };
    if (from || to) {
      filter.period_start = {};
      if (from) filter.period_start.$gte = new Date(from);
      if (to)   filter.period_start.$lte = new Date(to);
    }
    const rows = await RentalInvoiceModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$direction",
          total: { $sum: "$total_amount" },
          invoices: { $sum: 1 },
        },
      },
    ]);
    const out = { revenue: 0, cost: 0, net: 0, breakdown: rows };
    for (const r of rows) {
      if (r._id === "OUTGOING") out.revenue = r.total;
      if (r._id === "INCOMING") out.cost    = r.total;
    }
    out.net = Number((out.revenue - out.cost).toFixed(2));
    return out;
  }
}

export default RentalService;
