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
      received_items, // Array: [{ item_id, received_quantity, supplier_name, invoice_no }]
      purchase_request_id,
      received_by
    } = payload;

    // 1. Fetch the Material Document
    const materialDoc = await MaterialModel.findOne({ tender_id });
    if (!materialDoc) throw new Error(`Tender ${tender_id} not found`);

    // 2. Validate Purchase Request (Optional but recommended)
    let prRef = "";
    if (purchase_request_id) {
      const prDoc = await PurchaseRequestModel.findOne({ requestId: purchase_request_id });
      if (!prDoc) throw new Error(`Purchase Request ${purchase_request_id} not found`);
      prRef = prDoc.requestId;
    }

    // 3. Process Each Received Item
    const processedItems = [];

    for (const entry of received_items) {
      // Find item by ID (preferred) or Description (fallback)
      const itemSubDoc = materialDoc.items.find(
        (i) => i._id.toString() === entry.item_id || i.item_description === entry.item_description
      );

      if (!itemSubDoc) {
        throw new Error(`Item '${entry.item_description || entry.item_id}' not found in Material List`);
      }

      // Create Inward Record
      const inwardRecord = {
        date: new Date(),
        quantity: Number(entry.received_quantity),
        purchase_request_ref: prRef,
        supplier_name: entry.supplier_name || "",
        invoice_challan_no: entry.invoice_no || "",
        received_by: received_by || "Admin",
        remarks: entry.remarks || "Received via GRN"
      };

      // Push to History
      itemSubDoc.inward_history.push(inwardRecord);
      processedItems.push(itemSubDoc.item_description);
    }

    // 4. Save (Middleware automatically updates total_received_qty & current_stock_on_hand)
    await materialDoc.save();

    return {
      success: true,
      message: `Stock updated for: ${processedItems.join(", ")}`,
      tender_id
    };
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

    const materialDoc = await MaterialModel.findOne({ tender_id });
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
        site_location: entry.work_location || "", // Specific block/floor
        work_description: entry.purpose || "",
        issued_by: issued_by || "Admin",
        priority_level: entry.priority || "Normal"
      };

      itemSubDoc.outward_history.push(outwardRecord);
      issuedLog.push(`${itemSubDoc.item_description}: -${qtyToIssue}`);
    }

    // Save (Middleware updates total_issued_qty & current_stock_on_hand)
    await materialDoc.save();

    return {
      success: true,
      message: "Materials issued successfully",
      details: issuedLog
    };
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
      .select("items.item_description items.unit items.unit_rate items.quantity items.total_item_quantity items.category items.total_received_qty items._id")
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
    }));

    return {
      tender_id,
      count: simplifiedList.length,
      materials: simplifiedList
    };
  }
}

export default MaterialService;