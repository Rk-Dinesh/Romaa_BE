import DepartmentModel from "./department.model.js";

class DepartmentService {
  static async upsert({ name, code, headId, parentDepartmentId, description, isActive, actorId }) {
    if (!name) throw { statusCode: 400, message: "name is required" };
    name = String(name).trim();
    const update = {
      ...(code !== undefined ? { code } : {}),
      ...(headId !== undefined ? { headId: headId || null } : {}),
      ...(parentDepartmentId !== undefined ? { parentDepartmentId: parentDepartmentId || null } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      updatedBy: actorId || null,
    };
    const doc = await DepartmentModel.findOneAndUpdate(
      { name },
      { $set: update, $setOnInsert: { name, createdBy: actorId || null } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return doc;
  }

  static async list({ isActive, search, page, limit } = {}) {
    const q = {};
    if (isActive !== undefined) q.isActive = isActive === true || isActive === "true";
    if (search) {
      const s = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      q.$or = [
        { name: { $regex: s, $options: "i" } },
        { code: { $regex: s, $options: "i" } },
      ];
    }
    const pg  = Math.max(1, parseInt(page)  || 1);
    const lim = Math.max(1, Math.min(200, parseInt(limit) || 50));
    const [data, total] = await Promise.all([
      DepartmentModel.find(q)
        .populate("headId", "name employeeId designation email")
        .sort({ name: 1 })
        .skip((pg - 1) * lim).limit(lim).lean(),
      DepartmentModel.countDocuments(q),
    ]);
    return { data, total, page: pg, limit: lim };
  }

  static async getById(id) {
    const doc = await DepartmentModel.findById(id)
      .populate("headId", "name employeeId designation email")
      .lean();
    if (!doc) throw { statusCode: 404, message: "Department not found" };
    return doc;
  }

  // Used by HOD resolver — string match against Employee.department to
  // bridge the legacy schema (department is a String, not an ObjectId).
  static async getByName(name) {
    if (!name) return null;
    return await DepartmentModel.findOne({ name, isActive: true })
      .select("headId parentDepartmentId name").lean();
  }

  static async deleteById(id) {
    const out = await DepartmentModel.findByIdAndDelete(id);
    if (!out) throw { statusCode: 404, message: "Department not found" };
    return out;
  }
}

export default DepartmentService;
