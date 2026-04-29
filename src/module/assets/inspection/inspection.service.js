import InspectionTemplateModel from "./inspectiontemplate.model.js";
import AssetInspectionModel from "./assetinspection.model.js";
import MachineryAsset from "../machinery/machineryasset.model.js";
import WorkOrderService from "../workorder/workorder.service.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import { AppError } from "../../../common/AppError.js";

class InspectionService {
  // ── Templates ──────────────────────────────────────────────────────────
  static async createTemplate(data, userId) {
    const template_id = data.template_id || (await IdcodeServices.generateCode("INSP_TEMPLATE"));
    return InspectionTemplateModel.create({ ...data, template_id, created_by: userId });
  }

  static async listTemplates(query = {}) {
    const filter = {};
    if (query.asset_class) filter.asset_class = query.asset_class;
    if (query.frequency)   filter.frequency = query.frequency;
    if (query.is_active !== undefined) filter.is_active = query.is_active === "true" || query.is_active === true;
    return InspectionTemplateModel.find(filter).sort({ asset_class: 1, frequency: 1 });
  }

  static async getTemplate(template_id) {
    const t = await InspectionTemplateModel.findOne({ template_id });
    if (!t) throw new AppError("Template not found", 404);
    return t;
  }

  static async updateTemplate(template_id, data, userId) {
    data.updated_by = userId;
    const t = await InspectionTemplateModel.findOneAndUpdate({ template_id }, data, { new: true, runValidators: true });
    if (!t) throw new AppError("Template not found", 404);
    return t;
  }

  // ── Submissions ────────────────────────────────────────────────────────
  static async submit(data, userId) {
    const template = await InspectionTemplateModel.findById(data.template_ref);
    if (!template) throw new AppError("Template not found", 404);
    if (!template.is_active) throw new AppError("Template is inactive", 400);

    const asset = await MachineryAsset.findById(data.asset_ref);
    if (!asset) throw new AppError("Machinery asset not found", 404);

    // Validate responses cover all template items, and tag is_critical
    const itemsByNo = new Map(template.items.map((i) => [i.item_no, i]));
    const enriched = (data.responses || []).map((r) => {
      const tmpl = itemsByNo.get(r.item_no);
      return {
        ...r,
        question: r.question || tmpl?.question,
        is_critical: !!tmpl?.is_critical,
      };
    });

    const failed_critical = enriched.filter((r) => r.is_critical && r.result === "FAIL").length;
    const failed_noncrit  = enriched.filter((r) => !r.is_critical && r.result === "FAIL").length;
    const overall_result =
      failed_critical > 0 ? "FAIL_CRITICAL" :
      failed_noncrit  > 0 ? "FAIL_NON_CRITICAL" :
      "PASS";

    const inspection_id = data.inspection_id || (await IdcodeServices.generateCode("ASSET_INSPECTION"));

    const insp = await AssetInspectionModel.create({
      ...data,
      inspection_id,
      assetId: asset.assetId,
      asset_name: asset.assetName,
      projectId: data.projectId || asset.projectId,
      template_title: template.title,
      frequency: template.frequency,
      responses: enriched,
      overall_result,
      failed_critical_count: failed_critical,
      failed_non_critical_count: failed_noncrit,
      created_by: userId,
    });

    // Side-effects on critical fail:
    // 1. Flip asset to Breakdown so it can't be issued/operated.
    // 2. Auto-create a remediation Work Order.
    if (overall_result === "FAIL_CRITICAL") {
      await MachineryAsset.updateOne(
        { _id: asset._id },
        { $set: { currentStatus: "Breakdown" } }
      );
      try {
        const wo = await WorkOrderService.create(
          {
            asset_ref: asset._id,
            kind: "INSPECTION_REMEDIATION",
            title: `Critical inspection failure: ${template.title}`,
            description: `Auto-raised from inspection ${inspection_id}. ${failed_critical} critical item(s) failed.`,
            priority: "CRITICAL",
            inspection_ref: insp._id,
            status: "DRAFT",
            reading_at_start: data.reading,
          },
          userId
        );
        insp.remediation_work_order_ref = wo._id;
        await insp.save();
      } catch (_err) {
        // do not fail inspection submission if WO creation fails
      }
    }

    return insp;
  }

  static async listSubmissions(query = {}) {
    const { page = 1, limit = 20, assetId, projectId, overall_result, from, to } = query;
    const filter = {};
    if (assetId) filter.assetId = assetId;
    if (projectId) filter.projectId = projectId;
    if (overall_result) filter.overall_result = overall_result;
    if (from || to) {
      filter.inspected_at = {};
      if (from) filter.inspected_at.$gte = new Date(from);
      if (to)   filter.inspected_at.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      AssetInspectionModel.find(filter).sort({ inspected_at: -1 }).skip(skip).limit(Number(limit)),
      AssetInspectionModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } };
  }

  static async getSubmission(inspection_id) {
    const r = await AssetInspectionModel.findOne({ inspection_id });
    if (!r) throw new AppError("Inspection not found", 404);
    return r;
  }
}

export default InspectionService;
