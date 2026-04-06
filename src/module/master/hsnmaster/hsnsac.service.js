import HsnSacMasterModel from "./hsnsac.model.js";


class HsnSacService {
  // 1. Single Add
  static async createHsnSac(data) {
    // Check if code already exists
    const existing = await HsnSacMasterModel.findOne({ code: data.code });
    if (existing) {
      throw new Error(`HSN/SAC Code '${data.code}' already exists.`);
    }
    const newRecord = new HsnSacMasterModel(data);
    return await newRecord.save();
  }

  // 2. Bulk Upload (with Upsert logic)
 static async bulkUploadHsnSacFromCsv(csvRows) {
    // We use a Map to ensure unique codes (Key: HSN/SAC Code)
    // If the CSV has duplicate codes, the last one in the file wins.
    const operationsMap = new Map();
    const errors = [];

    // ---------------------------------------------------------
    // STEP 1: Process CSV Rows
    // ---------------------------------------------------------
    for (const [index, row] of csvRows.entries()) {
      // 1. Extract and clean the Code
      const code = (row.CODE || row.code || "").toString().trim().toUpperCase();
      
      if (!code) {
        errors.push({ row: index + 1, message: "Missing HSN/SAC Code" });
        continue;
      }

      // 2. Extract and validate Type
      let type = (row.TYPE || row.type || "").toString().trim().toUpperCase();
      if (!["HSN", "SAC"].includes(type)) {
        errors.push({ row: index + 1, message: `Invalid Type '${type}' for code ${code}. Must be HSN or SAC.` });
        continue;
      }

      // 3. Extract Descriptions
      const description = (row.DESCRIPTION || row.description || "").toString().trim();
      const shortDescription = (row.SHORT_DESCRIPTION || row.shortDescription || "").toString().trim().substring(0, 100);

      if (!description) {
        errors.push({ row: index + 1, message: `Missing description for code ${code}` });
        continue;
      }

      // 4. Extract Tax Structure (Defaults to 0 if invalid/empty)
      const parseTax = (val) => {
        const parsed = parseFloat(val);
        return isNaN(parsed) || parsed < 0 ? 0 : parsed;
      };

      const igst = parseTax(row.IGST || row.igst);
      
      // Auto-calculate CGST & SGST if not provided, assuming they are half of IGST
      const rawCgst = row.CGST || row.cgst;
      const rawSgst = row.SGST || row.sgst;
      
      const cgst = rawCgst !== undefined && rawCgst !== "" ? parseTax(rawCgst) : igst / 2;
      const sgst = rawSgst !== undefined && rawSgst !== "" ? parseTax(rawSgst) : igst / 2;
      const cess = parseTax(row.CESS || row.cess);

      // 5. Extract Config
      const defaultUom = (row.UOM || row.defaultUom || "").toString().trim().toUpperCase();
      
      // Treat "false", "0", "no" as false. Empty or anything else as true (Active by default).
      const rawIsActive = (row.IS_ACTIVE || row.isActive || "").toString().trim().toLowerCase();
      const isActive = !["false", "0", "no"].includes(rawIsActive);

      // Add to Map (Upsert Operation)
      operationsMap.set(code, {
        updateOne: {
          filter: { code: code },
          update: {
            $set: {
              code,
              type,
              description,
              shortDescription,
              taxStructure: { igst, cgst, sgst, cess },
              defaultUom,
              isActive
            }
          },
          upsert: true
        }
      });
    }

    // ---------------------------------------------------------
    // STEP 2: Execute All Operations
    // ---------------------------------------------------------
    const operations = Array.from(operationsMap.values());
    let result = {};

    if (operations.length > 0) {
      result = await HsnSacMasterModel.bulkWrite(operations);
    }

    return {
      totalProcessed: operations.length,
      successCount: (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0),
      failedCount: errors.length,
      errors: errors
    };
  }

  // 3. Get All (with Pagination, Search, and Filters)
  static async getAllHsnSac(query) {
    const { page = 1, limit = 10, search = "", type, isActive } = query;
    const skip = (page - 1) * limit;

    // Build dynamic filter object
    const filter = {};
    if (type) filter.type = type.toUpperCase();
    if (isActive !== undefined) filter.isActive = isActive === "true";

    // Search by Code or Description
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const [data, total] = await Promise.all([
      HsnSacMasterModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      HsnSacMasterModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // 4. Get Single by ID
  static async getHsnSacById(id) {
    const record = await HsnSacMasterModel.findById(id);
    if (!record) throw new Error("HSN/SAC record not found. Please verify the code and try again");
    return record;
  }

  // 5. Update Record
  static async updateHsnSac(id, updateData) {
    // Prevent updating to an existing code
    if (updateData.code) {
      const existing = await HsnSacMasterModel.findOne({ code: updateData.code, _id: { $ne: id } });
      if (existing) throw new Error(`HSN/SAC code '${updateData.code}' is already assigned to another entry`);
    }

    const updatedRecord = await HsnSacMasterModel.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    
    if (!updatedRecord) throw new Error("HSN/SAC record not found. Please verify the code and try again");
    return updatedRecord;
  }

  // 6. Hard Delete
  static async deleteHsnSac(id) {
    const deletedRecord = await HsnSacMasterModel.findByIdAndDelete(id);
    if (!deletedRecord) throw new Error("HSN/SAC record not found. Please verify the code and try again");
    return deletedRecord;
  }

  // 7. Toggle Active Status (Soft Delete alternative)
  static async toggleStatus(id) {
    const record = await HsnSacMasterModel.findById(id);
    if (!record) throw new Error("HSN/SAC record not found. Please verify the code and try again");

    record.isActive = !record.isActive;
    return await record.save();
  }
}

export default HsnSacService;
