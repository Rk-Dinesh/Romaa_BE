import OperatorCertModel from "./operatorcert.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import { AppError } from "../../../common/AppError.js";

class OperatorCertService {
  static async create(data, userId) {
    const cert_id = data.cert_id || (await IdcodeServices.generateCode("OPERATOR_CERT"));
    return OperatorCertModel.create({ ...data, cert_id, created_by: userId });
  }

  static async getAll(query = {}) {
    const { page = 1, limit = 20, employee_id, asset_class, status, expiring_in_days } = query;
    const filter = {};
    if (employee_id) filter.employee_id = employee_id;
    if (asset_class) filter.asset_class = asset_class;
    if (status) filter.status = status;
    if (expiring_in_days) {
      const target = new Date();
      target.setDate(target.getDate() + Number(expiring_in_days));
      filter.expiry_date = { $lte: target };
      filter.status = "ACTIVE";
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      OperatorCertModel.find(filter).sort({ expiry_date: 1 }).skip(skip).limit(Number(limit)),
      OperatorCertModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } };
  }

  static async getById(cert_id) {
    const c = await OperatorCertModel.findOne({ cert_id });
    if (!c) throw new AppError("Certification not found", 404);
    return c;
  }

  static async update(cert_id, data, userId) {
    data.updated_by = userId;
    const c = await OperatorCertModel.findOneAndUpdate({ cert_id }, data, { new: true, runValidators: true });
    if (!c) throw new AppError("Certification not found", 404);
    return c;
  }

  static async revoke(cert_id, reason, userId) {
    return OperatorCertModel.findOneAndUpdate(
      { cert_id },
      { status: "REVOKED", revoked_reason: reason, updated_by: userId },
      { new: true }
    );
  }

  // Sweep — flip ACTIVE → EXPIRED for any cert past its expiry date.
  static async sweepExpired() {
    const result = await OperatorCertModel.updateMany(
      { status: "ACTIVE", expiry_date: { $lt: new Date() } },
      { status: "EXPIRED" }
    );
    return { modified: result.modifiedCount || 0 };
  }

  // ── Enforcement helpers (called by other services) ─────────────────────
  // Returns the active certification (if any) that authorises the given
  // employee to operate the given asset class.
  static async findValid({ employee_id, asset_class, asset_category }) {
    const filter = {
      employee_id,
      asset_class,
      status: "ACTIVE",
      expiry_date: { $gte: new Date() },
    };
    if (asset_category) filter.asset_category = asset_category;
    return OperatorCertModel.findOne(filter).sort({ expiry_date: -1 });
  }

  // Throws if `employee_id` is not authorised to operate this asset class.
  static async assertAuthorized({ employee_id, asset_class, asset_category }) {
    const ok = await OperatorCertService.findValid({ employee_id, asset_class, asset_category });
    if (!ok)
      throw new AppError(
        `Employee ${employee_id} is not certified to operate ${asset_class}${asset_category ? ` / ${asset_category}` : ""}`,
        403,
        "OPERATOR_NOT_CERTIFIED"
      );
    return ok;
  }
}

export default OperatorCertService;
