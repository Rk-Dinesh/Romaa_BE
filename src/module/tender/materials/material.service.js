import MaterialModel from "./material.model.js";

class materialService {
  // Create new material
  static async createMaterial(data) {
    const material = new MaterialModel(data);
    return await material.save();
  }

  static async addMaterialreceived(data) {
    const { tender_id, item_description, received_quantity, ordered_date } =
      data;

    // Find tender document first
    const existingTender = await MaterialModel.findOne({ tender_id });

    if (!existingTender) {
      throw new Error(`Tender with ID ${tender_id} not found`);
    }

    // Find the item inside the tender’s items array
    const itemIndex = existingTender.items.findIndex(
      (item) => item.item_description === item_description
    );

    if (itemIndex === -1) {
      throw new Error(
        `Item '${item_description}' not found under Tender ${tender_id}`
      );
    }

    const item = existingTender.items[itemIndex];

    // Calculate updated values
    const newReceived =
      (item.received_quantity || 0) + Number(received_quantity || 0);
    const newPending = Math.max((item.quantity || 0) - newReceived, 0);

    // Update values
    item.received_quantity = newReceived;
    item.pending_quantity = newPending;
    item.ordered_date = ordered_date;

    // Save tender document
    await existingTender.save();

    return {
      message: "Material item updated successfully",
      updatedItem: item,
    };
  }
static async addMaterialissued(data) {
  const {
    tender_id,
    item_description,
    site_name,
    work_location,
    issued_quantity,
    priority_level,
    requested_by,
  } = data;

  // Find Tender
  const existingTender = await MaterialModel.findOne({ tender_id });
  if (!existingTender) throw new Error(`Tender ${tender_id} not found`);

  // Find item
  const item = existingTender.items.find(
    (i) => i.item_description === item_description
  );
  if (!item) throw new Error(`Material '${item_description}' not found`);

  // Calculate balance
  const totalIssued = item.issued_details?.reduce(
    (sum, i) => sum + i.issued_quantity,
    0
  ) || 0;

  const balance = item.received_quantity - totalIssued;

  // Prevent exceeding limit
  if (issued_quantity > balance) {
    throw new Error(
      `Cannot issue more than balance. Balance available: ${balance}`
    );
  }

  // 🔥 Push new entry instead of overriding
  item.issued.push({
    site_name,
    work_location,
    issued_quantity,
    priority_level,
    requested_by,
    issued_date: new Date(),
  });

  // Save document
  await existingTender.save();

  return {
    message: "Material issued successfully",
    issued: item.issued,
    balance: balance - issued_quantity,
  };
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

    if (!materials) return { items: [], totalPages: 1 };

    const paginatedItems = materials.items.slice(skip, skip + limit);
    const totalPages = Math.ceil(materials.items.length / limit) || 1;

    return { items: paginatedItems, totalPages };
  }
}

export default materialService;