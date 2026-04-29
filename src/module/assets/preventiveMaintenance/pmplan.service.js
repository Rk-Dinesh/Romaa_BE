import PmPlanModel from "./pmplan.model.js";
import MachineryAsset from "../machinery/machineryasset.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import { AppError } from "../../../common/AppError.js";

class PmPlanService {
  static _validateTrigger(p) {
    if (p.triggerType === "METER" && !p.intervalReading)
      throw new AppError("intervalReading is required for METER trigger", 400);
    if (p.triggerType === "CALENDAR" && !p.intervalDays)
      throw new AppError("intervalDays is required for CALENDAR trigger", 400);
    if (p.triggerType === "BOTH" && !(p.intervalReading && p.intervalDays))
      throw new AppError("BOTH trigger requires intervalReading and intervalDays", 400);
  }

  static _computeNextDue(plan, asset) {
    const out = { nextDueAt: null, nextDueAtReading: null };
    const baseDate = plan.lastTriggeredAt || asset.purchaseDate || asset.createdAt || new Date();
    const baseReading = plan.lastTriggeredAtReading ?? 0;
    if (plan.intervalDays) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + plan.intervalDays);
      out.nextDueAt = d;
    }
    if (plan.intervalReading) {
      out.nextDueAtReading = baseReading + plan.intervalReading;
    }
    return out;
  }

  static async createPlan(data, userId) {
    PmPlanService._validateTrigger(data);
    const asset = await MachineryAsset.findById(data.asset_ref);
    if (!asset) throw new AppError("Machinery asset not found", 404);

    const pm_plan_id = data.pm_plan_id || (await IdcodeServices.generateCode("PM_PLAN"));
    const computed = PmPlanService._computeNextDue(data, asset);

    const doc = await PmPlanModel.create({
      ...data,
      ...computed,
      pm_plan_id,
      assetId: asset.assetId,
      asset_name: asset.assetName,
      asset_class: asset.assetCategory,
      created_by: userId,
    });

    await PmPlanService._refreshAssetSummary(asset._id);
    return doc;
  }

  static async getAll(query = {}) {
    const { page = 1, limit = 20, assetId, is_active } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};
    if (assetId) filter.assetId = assetId;
    if (is_active !== undefined) filter.is_active = is_active === "true" || is_active === true;

    const [data, total] = await Promise.all([
      PmPlanModel.find(filter).sort({ nextDueAt: 1 }).skip(skip).limit(Number(limit)),
      PmPlanModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } };
  }

  static async getById(pm_plan_id) {
    const doc = await PmPlanModel.findOne({ pm_plan_id });
    if (!doc) throw new AppError("PM plan not found", 404);
    return doc;
  }

  static async update(pm_plan_id, data, userId) {
    if (data.triggerType) PmPlanService._validateTrigger(data);
    data.updated_by = userId;
    const updated = await PmPlanModel.findOneAndUpdate({ pm_plan_id }, data, { new: true, runValidators: true });
    if (!updated) throw new AppError("PM plan not found", 404);
    await PmPlanService._refreshAssetSummary(updated.asset_ref);
    return updated;
  }

  static async toggleActive(pm_plan_id, userId) {
    const plan = await PmPlanModel.findOne({ pm_plan_id });
    if (!plan) throw new AppError("PM plan not found", 404);
    plan.is_active = !plan.is_active;
    plan.updated_by = userId;
    await plan.save();
    await PmPlanService._refreshAssetSummary(plan.asset_ref);
    return plan;
  }

  // Mark this plan as "fired" — called by the work-order workflow when the
  // PM-triggered work order is closed.
  static async markFired(pm_plan_id, { firedAt, firedAtReading } = {}) {
    const plan = await PmPlanModel.findOne({ pm_plan_id });
    if (!plan) return null;
    plan.lastTriggeredAt = firedAt || new Date();
    plan.lastTriggeredAtReading = firedAtReading ?? plan.lastTriggeredAtReading;
    const asset = await MachineryAsset.findById(plan.asset_ref);
    Object.assign(plan, PmPlanService._computeNextDue(plan, asset || {}));
    await plan.save();
    await PmPlanService._refreshAssetSummary(plan.asset_ref);
    return plan;
  }

  // ── Due-list logic ─────────────────────────────────────────────────────
  // A plan is "due" if either threshold crosses now+leadTime.
  static async getDuePlans({ leadDaysOverride } = {}) {
    const now = new Date();
    const plans = await PmPlanModel.find({ is_active: true }).lean();
    const out = [];
    for (const p of plans) {
      const leadDays = leadDaysOverride ?? p.leadTimeDays;
      const leadReading = p.leadTimeReading;
      const dueByCalendar =
        p.nextDueAt && new Date(p.nextDueAt).getTime() - now.getTime() <= leadDays * 86400000;
      let dueByMeter = false;
      if (p.intervalReading) {
        // need fresh asset reading
        const a = await MachineryAsset.findById(p.asset_ref).select("lastReading").lean();
        if (a && a.lastReading != null && p.nextDueAtReading != null) {
          dueByMeter = a.lastReading + leadReading >= p.nextDueAtReading;
        }
      }
      if (dueByCalendar || dueByMeter) out.push(p);
    }
    return out;
  }

  static async _refreshAssetSummary(assetRef) {
    const plans = await PmPlanModel.find({ asset_ref: assetRef, is_active: true })
      .sort({ nextDueAt: 1 })
      .lean();
    const next = plans[0];
    await MachineryAsset.updateOne(
      { _id: assetRef },
      {
        $set: {
          "preventiveMaintenance.activePlanCount": plans.length,
          "preventiveMaintenance.nextServiceDueAt": next?.nextDueAt || null,
          "preventiveMaintenance.nextServiceDueAtReading": next?.nextDueAtReading || null,
        },
      }
    );
  }
}

export default PmPlanService;
