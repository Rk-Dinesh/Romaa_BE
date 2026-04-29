import InsuranceClaimModel from "./insuranceclaim.model.js";
import MachineryAsset from "../machinery/machineryasset.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import { AppError } from "../../../common/AppError.js";

// Allowed transitions
const NEXT = {
  REPORTED:            ["SURVEY", "WITHDRAWN", "REJECTED"],
  SURVEY:              ["DOCUMENTS_SUBMITTED", "REJECTED", "WITHDRAWN"],
  DOCUMENTS_SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED:            ["SETTLED"],
  SETTLED:             [],
  REJECTED:            [],
  WITHDRAWN:           [],
};

class InsuranceClaimService {
  static async create(data, userId) {
    const asset = await MachineryAsset.findById(data.asset_ref);
    if (!asset) throw new AppError("Machinery asset not found", 404);
    const claim_id = data.claim_id || (await IdcodeServices.generateCode("INSURANCE_CLAIM"));
    return InsuranceClaimModel.create({
      ...data,
      claim_id,
      assetId: asset.assetId,
      asset_name: asset.assetName,
      insurance_policy_no: data.insurance_policy_no || asset.compliance?.insurancePolicyNo,
      created_by: userId,
    });
  }

  static async getAll(query = {}) {
    const { page = 1, limit = 20, assetId, status, incident_type, from, to } = query;
    const filter = {};
    if (assetId) filter.assetId = assetId;
    if (status) filter.status = status;
    if (incident_type) filter.incident_type = incident_type;
    if (from || to) {
      filter.incident_date = {};
      if (from) filter.incident_date.$gte = new Date(from);
      if (to)   filter.incident_date.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      InsuranceClaimModel.find(filter).sort({ incident_date: -1 }).skip(skip).limit(Number(limit)),
      InsuranceClaimModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } };
  }

  static async getById(claim_id) {
    const c = await InsuranceClaimModel.findOne({ claim_id });
    if (!c) throw new AppError("Claim not found", 404);
    return c;
  }

  static async update(claim_id, data, userId) {
    data.updated_by = userId;
    const c = await InsuranceClaimModel.findOneAndUpdate({ claim_id }, data, { new: true, runValidators: true });
    if (!c) throw new AppError("Claim not found", 404);
    return c;
  }

  static async transition(claim_id, toStatus, payload, userId) {
    const c = await InsuranceClaimModel.findOne({ claim_id });
    if (!c) throw new AppError("Claim not found", 404);
    if (!(NEXT[c.status] || []).includes(toStatus))
      throw new AppError(`Invalid transition ${c.status} → ${toStatus}`, 400);
    c.status = toStatus;
    if (toStatus === "REJECTED")  c.rejection_reason = payload?.reason || c.rejection_reason;
    if (toStatus === "APPROVED")  c.approved_amount  = payload?.approved_amount ?? c.approved_amount;
    if (toStatus === "SETTLED") {
      c.settled_amount  = payload?.settled_amount ?? c.approved_amount;
      c.settlement_date = payload?.settlement_date ? new Date(payload.settlement_date) : new Date();
    }
    c.updated_by = userId;
    await c.save();
    return c;
  }

  static async addDocument(claim_id, doc, userId) {
    const c = await InsuranceClaimModel.findOneAndUpdate(
      { claim_id },
      { $push: { documents: doc }, updated_by: userId },
      { new: true }
    );
    if (!c) throw new AppError("Claim not found", 404);
    return c;
  }

  static async getSummary({ assetId } = {}) {
    const filter = {};
    if (assetId) filter.assetId = assetId;
    return InsuranceClaimModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          claimed_total: { $sum: "$claimed_amount" },
          approved_total: { $sum: "$approved_amount" },
          settled_total: { $sum: "$settled_amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }
}

export default InsuranceClaimService;
