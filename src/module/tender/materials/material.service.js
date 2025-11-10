import MaterialModel from "./material.model.js";


class materialService {
  // Create new material
  static async createMaterial(data) {
    const material = new MaterialModel(data);
    return await material.save();
  }

  static async bulkInsert(csvRows, createdByUser, tender_id) {
    if (!Array.isArray(csvRows) || csvRows.length === 0)
      throw new Error("CSV data is empty or invalid");

    // Map CSV rows to item schema
    const items = csvRows.map((row) => {
      const quantity = Number(row.quantity) || 0;
      const unit_rate = Number(row.unit_rate) || 0;
      const rate_tax = Number(row.rate_tax) || 0;
      const total_amount = Number(row.total_amount) || quantity * unit_rate;
      const total_material = Number(row.total_material) || 0;

      return {
        item_description: row.item_description || row.description || "",
        unit: row.unit || "",
        quantity,
        unit_rate,
        rate_tax,
        total_amount,
        total_material,
      };
    });

    // Check if materials for this tender already exist
    let existing = await MaterialModel.findOne({ tender_id });

    if (existing) {
      // Append new items
      existing.items.push(...items);
      existing.created_by_user = createdByUser || existing.created_by_user;
      return await existing.save();
    } else {
      // Create new tender material record
      const newMaterial = new MaterialModel({
        tender_id,
        created_by_user: createdByUser,
        items,
      });
      return await newMaterial.save();
    }
  }

  // ✅ Fetch all materials (with pagination optional)
  static async getAllMaterials(tender_id, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const materials = await MaterialModel.findOne({ tender_id })
      .select("items tender_id created_by_user")
      .lean();

    if (!materials)
      return { items: [], totalPages: 1 };

    const paginatedItems = materials.items.slice(skip, skip + limit);
    const totalPages = Math.ceil(materials.items.length / limit) || 1;

    return { items: paginatedItems, totalPages };
  }
  

};

export default materialService;
