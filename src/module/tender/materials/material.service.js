import mongoose from "mongoose";
import MaterialModel from "./material.model.js";
import PurchaseRequestModel from "../../purchase/purchaseorderReqIssue/purchaseReqIssue.model.js";

class MaterialService {

  /**
   * API 1: Receive Materials (Inward Entry)
   * Handles receiving materials against a Purchase Request or Direct Purchase.
   * Can accept a single item or an array of items.
   */
static async addMaterialReceived(payload) {
  const {
    tender_id,
    requestId,
    received_items,
    received_by,
    invoice_no,
    site_name
  } = payload;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch the Material Inventory Document (inside session for consistent read)
    const materialDoc = await MaterialModel.findOne({ tender_id }).session(session);
    if (!materialDoc) throw new Error(`Tender ${tender_id} not found in Inventory`);

    // 2. Validate Purchase Request and extract Vendor Info
    const prDoc = await PurchaseRequestModel.findOne({ requestId }).session(session);
    if (!prDoc) throw new Error(`Purchase Request ${requestId} not found`);

    const vendorName = prDoc.selectedVendor?.vendorName || "";
    const vendorId = prDoc.selectedVendor?.vendorId || "";

    const processedItems = [];

    // 3. Loop through incoming items
    for (const entry of received_items) {
      const qty = Number(entry.received_quantity);
      if (qty <= 0) continue;

      // A. Find the item in the Inventory (MaterialModel)
      const itemSubDoc = materialDoc.items.find(
        (i) => i.item_description === entry.item_description
      );

      if (!itemSubDoc) {
        throw new Error(`Item '${entry.item_description}' not found in Inventory.`);
      }

      // B. HYDRATION LOGIC: Find the item details in the Purchase Request
      const prMaterial = prDoc.materialsRequired.find(
        (m) => m.materialName === entry.item_description
      );

      if (prMaterial) {
        // Update HSN if currently empty
        if (!itemSubDoc.hsnSac || itemSubDoc.hsnSac === "") {
          itemSubDoc.hsnSac = prMaterial.hsnSac;
        }

        // Update Type if currently empty
        if (!itemSubDoc.type || itemSubDoc.type === "") {
          itemSubDoc.type = prMaterial.type;
        }

        // Update Short Description if currently empty
        if (!itemSubDoc.shortDescription || itemSubDoc.shortDescription === "") {
          itemSubDoc.shortDescription = prMaterial.shortDescription;
        }

        // Update Tax Structure if currently 0/default
        const ts = itemSubDoc.taxStructure;
        const prTs = prMaterial.taxStructure;

        if (ts.igst === 0 && prTs.igst !== 0) ts.igst = prTs.igst;
        if (ts.cgst === 0 && prTs.cgst !== 0) ts.cgst = prTs.cgst;
        if (ts.sgst === 0 && prTs.sgst !== 0) ts.sgst = prTs.sgst;
        if (ts.cess === 0 && prTs.cess !== 0) ts.cess = prTs.cess;
      }

      // C. Create Inward Record
      const inwardRecord = {
        date: new Date(entry.ordered_date || Date.now()),
        quantity: qty,
        item_description: entry.item_description,
        purchase_request_ref: requestId,
        site_name: site_name || "",
        vendor_name: vendorName,
        vendor_id: vendorId,
        invoice_challan_no: invoice_no || "",
        received_by: received_by || "Admin",
        remarks: `Received against ${requestId}`
      };

      // Push to History
      itemSubDoc.inward_history.push(inwardRecord);
      processedItems.push(itemSubDoc.item_description);
    }

    // 4. Save inside session — rolls back automatically if this throws
    await materialDoc.save({ session });

    await session.commitTransaction();

    return {
      success: true,
      message: `Stock updated and metadata synced for: ${processedItems.join(", ")}`,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

  /**
   * API 2: Issue Materials (Outward Entry)
   * Handles issuing materials to site/labor.
   * Validation: Prevents issuing more than Current Stock.
   */
  static async addMaterialIssued(payload) {
    const {
      tender_id,
      issued_items, // Array: [{ item_id, issued_quantity, issued_to, work_location }]
      issued_by
    } = payload;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Read inside session — holds a consistent snapshot.
      // A concurrent request's in-flight write will cause a write conflict on commit,
      // preventing the lost-update race that allowed negative stock.
      const materialDoc = await MaterialModel.findOne({ tender_id }).session(session);
      if (!materialDoc) throw new Error(`Tender ${tender_id} not found`);

      const issuedLog = [];

      for (const entry of issued_items) {
        const itemSubDoc = materialDoc.items.find(
          (i) => i._id.toString() === entry.item_id || i.item_description === entry.item_description
        );

        if (!itemSubDoc) {
          throw new Error(`Item '${entry.item_description}' not found`);
        }

        const qtyToIssue = Number(entry.issued_quantity);

        // --- CRITICAL STOCK CHECK ---
        // We must calculate current stock manually here because 'save' hasn't run yet
        const currentStock = itemSubDoc.current_stock_on_hand;

        if (currentStock < qtyToIssue) {
          throw new Error(
            `Insufficient Stock for ${itemSubDoc.item_description}. Available: ${currentStock}, Requested: ${qtyToIssue}`
          );
        }

        // Create Outward Record
        const outwardRecord = {
          date: new Date(),
          quantity: qtyToIssue,
          issued_to: entry.issued_to || "",
          item_description: entry.item_description || "",
          site_location: entry.work_location || "", // Specific block/floor
          work_description: entry.purpose || "",
          issued_by: issued_by || "Admin",
          priority_level: entry.priority || "Normal"
        };

        itemSubDoc.outward_history.push(outwardRecord);
        issuedLog.push(`${itemSubDoc.item_description}: -${qtyToIssue}`);
      }

      // Save inside session — rolls back if this throws
      await materialDoc.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        message: "Materials issued successfully",
        details: issuedLog
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * API 3: Get Dashboard / Stock Status
   * Returns a clean list of all items with their live stock & procurement status.
   */
  static async getMaterialStockStatus(tender_id, categoryFilter = null) {
    const materialDoc = await MaterialModel.findOne({ tender_id }).lean();
    if (!materialDoc) return { items: [] };

    let items = materialDoc.items;

    if (categoryFilter) {
      items = items.filter(i => i.category === categoryFilter);
    }

    // Map to a clean, frontend-friendly format
    const stockReport = items.map(item => ({
      item_id: item._id,
      description: item.item_description,
      unit: item.unit,
      category: item.category,

      // Financials (Budget)
      budgeted_qty: item.total_item_quantity,

      // Procurement Status
      procurement_pending: item.pending_procurement_qty, // (Budget - Received)

      // Inventory Status
      opening_stock: item.opening_stock,
      total_received: item.total_received_qty,
      total_issued: item.total_issued_qty,
      current_stock: item.current_stock_on_hand, // The number site engineers need

      // Alerts
      is_low_stock: item.current_stock_on_hand < 10, // Example threshold
      is_over_budget: item.total_received_qty > item.total_item_quantity
    }));

    return {
      tender_id,
      total_items: stockReport.length,
      stock_data: stockReport
    };
  }

  /**
   * API 4: Get Detailed Item Ledger (History)
   * Combines Inward and Outward arrays into a single chronological timeline.
   */
  static async getItemLedger(tender_id, item_id) {
    const materialDoc = await MaterialModel.findOne({
      tender_id,
      "items._id": item_id
    });

    if (!materialDoc) throw new Error("Item not found");

    const item = materialDoc.items.id(item_id); // Mongoose helper to find subdoc

    // Combine Arrays
    const inward = item.inward_history.map(x => ({ ...x.toObject(), type: "IN", quantity: x.quantity }));
    const outward = item.outward_history.map(x => ({ ...x.toObject(), type: "OUT", quantity: -x.quantity })); // Negative for display

    // Merge and Sort by Date
    const timeline = [...inward, ...outward].sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      item_name: item.item_description,
      current_stock: item.current_stock_on_hand,
      history: timeline
    };
  }

  /**
   * API 5: Get Basic Material Details (For Dropdowns/Forms)
   * Returns a lightweight list of materials with budget info only.
   */
  static async getMaterialList(tender_id) {
    // Fetch only specific fields to optimize performance
    const materialDoc = await MaterialModel.findOne({ tender_id })
      .select("items.item_description items.unit items.unit_rate items.quantity items.total_item_quantity items.category items.total_received_qty items.total_issued_qty items.current_stock_on_hand items.pending_procurement_qty items._id")
      .lean();

    if (!materialDoc) return { items: [] };

    // Format the output cleanly
    const simplifiedList = materialDoc.items.map(item => ({
      item_id: item._id,
      description: item.item_description,
      category: item.category,
      unit: item.unit,
      unit_rate: item.unit_rate,
      total_budgeted_qty: item.total_item_quantity,
      total_received_qty: item.total_received_qty,
      total_issued_qty: item.total_issued_qty,
      current_stock_on_hand: item.current_stock_on_hand,
      pending_procurement_qty: item.pending_procurement_qty,
    }));

    return {
      tender_id,
      count: simplifiedList.length,
      materials: simplifiedList
    };
  }

  // Fetch received history specific to a Purchase Order (Request ID)
  static async getPOReceivedHistory(tender_id, requestId) {
    // 1. Fetch the material inventory for the project
    const materialDoc = await MaterialModel.findOne({ tender_id })
      .select("items.item_description items.unit items.inward_history")
      .lean();

    if (!materialDoc) return { materials: [] };

    // 2. Process each material to calculate sums for this specific PO
    const simplifiedList = materialDoc.items.map((item) => {
      
      // Filter transactions related ONLY to this Request ID
      const poTransactions = item.inward_history.filter(
        (log) => log.purchase_request_ref === requestId
      );

      // Sum the quantity
      const totalReceivedForPO = poTransactions.reduce(
        (sum, log) => sum + (log.quantity || 0),
        0
      );

      return {
        item_id: item._id,
        item_description: item.item_description,
        unit: item.unit,
        // The magic number needed for your "Balance" calculation
        total_received_for_po: totalReceivedForPO, 
        // Optional: Return logs if you want to show a history table tooltip
        history_logs: poTransactions.map(t => ({
            date: t.date,
            qty: t.quantity,
            invoice: t.invoice_challan_no
        }))
      };
    });

    return {
      tender_id,
      requestId,
      materials: simplifiedList,
    };
  }

  // GET /api/material/history/:tender_id/:item_id
static async getMaterialInwardHistory(tender_id, item_id) {
    // 1. Find the main document
    const materialDoc = await MaterialModel.findOne({ tender_id });
    if (!materialDoc) {
      throw new Error("Project (Tender) not found");
    }

    // 2. Find the specific material item sub-document
    // Note: Mongoose subdocuments can be accessed via .id()
    const item = materialDoc.items.id(item_id); 
    if (!item) {
      throw new Error("Material Item not found");
    }

    // 3. Sort history by date (newest first)
    // We use optional chaining (?.) just in case inward_history is undefined
    const history = (item.inward_history || []).sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );

    // 4. Return the formatted object
    return {
      item_name: item.item_description,
      unit: item.unit,
      total_received: item.total_received_qty,
      current_stock: item.current_stock_on_hand,
      history: history
    };
  }

  static async getMaterialOutwardHistory(tender_id, item_id) {
    // 1. Find the main document
    const materialDoc = await MaterialModel.findOne({ tender_id });
    if (!materialDoc) {
      throw new Error("Project (Tender) not found");
    }

    // 2. Find the specific material item sub-document
    const item = materialDoc.items.id(item_id); 
    if (!item) {
      throw new Error("Material Item not found");
    }

    // 3. Sort history by date (newest first)
    // Targeting 'outward_history' this time
    const history = (item.outward_history || []).sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );

    // 4. Return the formatted object
    return {
      item_name: item.item_description,
      unit: item.unit,
      total_issued: item.total_issued_qty, // Total quantity sent out
      current_stock: item.current_stock_on_hand,
      history: history
    };
}
}

export default MaterialService;