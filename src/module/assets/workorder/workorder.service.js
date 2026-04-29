import WorkOrderModel from "./workorder.model.js";
import MachineryAsset from "../machinery/machineryasset.model.js";
import MaintenanceLog from "../maintainencelog/maintainencelog.model.js";
import BulkInventoryService from "../bulkinventory/bulkinventory.service.js";
import PmPlanService from "../preventiveMaintenance/pmplan.service.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import { AppError } from "../../../common/AppError.js";

// Allowed transitions — explicit so the rules are inspectable.
const TRANSITIONS = {
  DRAFT:        ["APPROVED", "CANCELLED"],
  APPROVED:     ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS:  ["COMPLETED", "CANCELLED"],
  COMPLETED:    ["CLOSED"],
  CLOSED:       [],
  CANCELLED:    [],
};

function recompute(wo) {
  wo.parts_total = (wo.parts || []).reduce((s, p) => s + (p.total_cost || (p.unit_cost || 0) * (p.quantity_used || 0)), 0);
  wo.labor_total = (wo.labor || []).reduce((s, l) => s + (l.total_cost || (l.rate_per_hour || 0) * (l.hours || 0)), 0);
  wo.actual_cost = wo.parts_total + wo.labor_total + (wo.other_charges || 0) + (wo.tax_amount || 0);
}

class WorkOrderService {
  static async create(data, userId) {
    const asset = await MachineryAsset.findById(data.asset_ref);
    if (!asset) throw new AppError("Machinery asset not found", 404);

    const work_order_no = data.work_order_no || (await IdcodeServices.generateCode("WORK_ORDER"));
    const wo = new WorkOrderModel({
      ...data,
      work_order_no,
      assetId: asset.assetId,
      asset_name: asset.assetName,
      projectId: data.projectId || asset.projectId,
      created_by: userId,
      statusHistory: [{ from_status: null, to_status: data.status || "DRAFT", by_employee: userId, notes: "Created" }],
    });
    recompute(wo);
    await wo.save();
    return wo;
  }

  static async getAll(query = {}) {
    const { page = 1, limit = 20, status, assetId, projectId, kind, search } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};
    if (status) filter.status = status;
    if (assetId) filter.assetId = assetId;
    if (projectId) filter.projectId = projectId;
    if (kind) filter.kind = kind;
    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { work_order_no: { $regex: safe, $options: "i" } },
        { title: { $regex: safe, $options: "i" } },
        { assetId: { $regex: safe, $options: "i" } },
      ];
    }
    const [data, total] = await Promise.all([
      WorkOrderModel.find(filter).sort({ raised_at: -1 }).skip(skip).limit(Number(limit)),
      WorkOrderModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } };
  }

  static async getById(work_order_no) {
    const wo = await WorkOrderModel.findOne({ work_order_no });
    if (!wo) throw new AppError("Work order not found", 404);
    return wo;
  }

  static async update(work_order_no, data, userId) {
    const wo = await WorkOrderModel.findOne({ work_order_no });
    if (!wo) throw new AppError("Work order not found", 404);
    if (["CLOSED", "CANCELLED"].includes(wo.status))
      throw new AppError(`Cannot edit a ${wo.status} work order`, 400);

    Object.assign(wo, data, { updated_by: userId });
    recompute(wo);
    await wo.save();
    return wo;
  }

  static async transition(work_order_no, toStatus, { notes, reading } = {}, userId) {
    const wo = await WorkOrderModel.findOne({ work_order_no });
    if (!wo) throw new AppError("Work order not found", 404);
    const allowed = TRANSITIONS[wo.status] || [];
    if (!allowed.includes(toStatus))
      throw new AppError(`Invalid transition ${wo.status} → ${toStatus}`, 400);

    wo.statusHistory.push({ from_status: wo.status, to_status: toStatus, by_employee: userId, notes });
    wo.status = toStatus;
    wo.updated_by = userId;

    const now = new Date();
    if (toStatus === "APPROVED")    wo.approved_at = now;
    if (toStatus === "IN_PROGRESS") {
      wo.started_at = now;
      if (reading != null) wo.reading_at_start = reading;
    }
    if (toStatus === "COMPLETED") {
      wo.completed_at = now;
      if (reading != null) wo.reading_at_end = reading;
      if (wo.started_at) {
        wo.downtime_hours = Number(((now - wo.started_at) / 3600000).toFixed(2));
      }
    }
    if (toStatus === "CLOSED") {
      wo.closed_at = now;
      await WorkOrderService._postClosureSideEffects(wo, userId);
    }
    if (toStatus === "CANCELLED") {
      wo.closed_at = now;
    }

    recompute(wo);
    await wo.save();
    return wo;
  }

  // On CLOSED:
  //   1. Issue any planned-but-not-yet-issued parts from BulkInventory
  //   2. Post a MaintenanceLog entry
  //   3. Update MachineryAsset.lastReading + preventiveMaintenance summary
  //   4. If sourced from a PM plan, mark that plan as fired (recomputes nextDue)
  static async _postClosureSideEffects(wo, userId) {
    // 1. Issue parts that have a quantity_used but no issued_txn_ref yet
    for (const p of wo.parts) {
      if (p.item_ref && (p.quantity_used || 0) > 0 && !p.issued_txn_ref) {
        try {
          const txn = await BulkInventoryService.issue(
            {
              item_ref: p.item_ref,
              quantity: p.quantity_used,
              from_location_type: "STORE",
              from_location_id: wo.projectId || "MAIN_STORE",
              from_location_name: "Main Store",
              recipient_kind: "SITE",
              recipient_id: wo.projectId,
              recipient_name: wo.projectId,
              reference_type: "WORK_ORDER",
              reference_number: wo.work_order_no,
              unit_cost: p.unit_cost,
              total_cost: p.total_cost || (p.unit_cost || 0) * (p.quantity_used || 0),
              notes: `Auto-issued on WO closure: ${wo.work_order_no}`,
            },
            userId
          );
          p.issued_txn_ref = txn?.transaction?._id || null;
        } catch (_err) {
          // Stock issue may legitimately fail (no stock, etc.) — log & continue
        }
      }
    }

    // 2. Post MaintenanceLog
    const maintenance_id = await IdcodeServices.generateCode("MAINTENANCE_LOG");
    const mlog = await MaintenanceLog.create({
      maintenance_id,
      assetId: wo.assetId,
      projectId: wo.projectId,
      date: wo.completed_at || wo.closed_at || new Date(),
      work_order_ref: wo._id,
      work_order_no: wo.work_order_no,
      category: wo.kind === "PM" ? "Scheduled Service" : "Breakdown Repair",
      description: wo.title,
      vendorId: wo.vendorId,
      vendorName: wo.vendorName,
      parts: wo.parts.map((p) => ({
        item_ref: p.item_ref,
        item_id_label: p.item_id_label,
        item_name: p.item_name,
        quantity: p.quantity_used,
        unit: p.unit,
        unit_cost: p.unit_cost,
        total_cost: p.total_cost || (p.unit_cost || 0) * (p.quantity_used || 0),
      })),
      labor: wo.labor,
      parts_total: wo.parts_total,
      labor_total: wo.labor_total,
      other_charges: wo.other_charges,
      tax_amount: wo.tax_amount,
      amount: wo.actual_cost,
      invoiceNumber: wo.invoiceNumber,
      invoice_url: wo.invoice_url,
      breakdown_started_at: wo.started_at,
      breakdown_ended_at: wo.completed_at,
      downtime_hours: wo.downtime_hours,
      meterReadingAtService: wo.reading_at_end,
      created_by: userId,
    });
    wo.maintenance_log_ref = mlog._id;

    // 3. Update asset
    await MachineryAsset.updateOne(
      { _id: wo.asset_ref },
      {
        $set: {
          ...(wo.reading_at_end != null && { lastReading: wo.reading_at_end, lastReadingDate: new Date() }),
          "preventiveMaintenance.lastServiceDate": wo.completed_at || new Date(),
          "preventiveMaintenance.lastServiceAtReading": wo.reading_at_end ?? null,
        },
      }
    );

    // 4. PM-plan fired
    if (wo.pm_plan_ref) {
      const planDoc = await (await import("../preventiveMaintenance/pmplan.model.js")).default.findById(wo.pm_plan_ref);
      if (planDoc) {
        await PmPlanService.markFired(planDoc.pm_plan_id, {
          firedAt: wo.completed_at,
          firedAtReading: wo.reading_at_end,
        });
      }
    }
  }

  // Auto-create PM work orders from due plans. Idempotent: skips plans that
  // already have an open WO. Returns the list of newly-created WOs.
  static async autoCreateFromDuePlans(userId) {
    const due = await PmPlanService.getDuePlans();
    const created = [];
    for (const plan of due) {
      const existing = await WorkOrderModel.findOne({
        pm_plan_ref: plan._id,
        status: { $in: ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED"] },
      });
      if (existing) continue;

      const wo = await WorkOrderService.create(
        {
          asset_ref: plan.asset_ref,
          kind: "PM",
          title: plan.name,
          description: plan.description,
          priority: plan.priority || "MEDIUM",
          pm_plan_ref: plan._id,
          parts: (plan.parts || []).map((p) => ({
            item_ref: p.item_ref,
            item_id_label: p.item_id_label,
            item_name: p.item_name,
            quantity_planned: p.quantity,
            quantity_used: 0,
            unit: p.unit,
          })),
          estimated_cost: plan.estimated_cost,
          status: "DRAFT",
        },
        userId
      );
      created.push(wo);
    }
    return created;
  }
}

export default WorkOrderService;
