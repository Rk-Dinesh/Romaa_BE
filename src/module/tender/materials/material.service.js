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
      requestId, // The PO Number (e.g., POR011)
      received_items, // Array: [{ item_description, received_quantity, ... }]
      received_by,
      invoice_no, // Common invoice for the batch
      site_name
    } = payload;

    // 1. Fetch the Material Inventory Document
    const materialDoc = await MaterialModel.findOne({ tender_id });
    if (!materialDoc) throw new Error(`Tender ${tender_id} not found in Inventory`);

    // 2. Validate Purchase Request
    
      const prDoc = await PurchaseRequestModel.findOne({ requestId: requestId });
      if (!prDoc) throw new Error(`Purchase Request ${requestId} not found`);
      const vendorName = prDoc.selectedVendor.vendorName;
      const vendorId = prDoc.selectedVendor.vendorId;
    
    const processedItems = [];

    // 3. Loop through incoming items
    for (const entry of received_items) {
      const qty = Number(entry.received_quantity);

      // Skip if quantity is 0
      if (qty <= 0) continue;

      // Find the item in the Inventory (MaterialModel) matching the description
      const itemSubDoc = materialDoc.items.find(
        (i) => i.item_description === entry.item_description
      );

      if (!itemSubDoc) {
        throw new Error(`Item '${entry.item_description}' not found in Material Inventory. Please add it to the budget first.`);
      }

      // Create Inward Record
      const inwardRecord = {
        date: new Date(entry.ordered_date || Date.now()),
        quantity: qty,
        item_description: entry.item_description,
        purchase_request_ref: requestId, // CRITICAL: Links this receipt to the PO
        site_name: site_name || "",
        vendor_name: vendorName || "",
        vendor_id: vendorId || "",
        invoice_challan_no: invoice_no || "",
        received_by: received_by || "Admin",
        remarks: `Received against ${requestId}`
      };

      // Push to History
      itemSubDoc.inward_history.push(inwardRecord);
      processedItems.push(itemSubDoc.item_description);
    }

    // 4. Save (Middleware will auto-calculate total_received and current_stock)
    await materialDoc.save();

    return {
      success: true,
      message: `Stock updated for: ${processedItems.join(", ")}`,
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
      .select("items.item_description items.unit items.unit_rate items.quantity items.total_item_quantity items.category items.total_received_qty items.total_issued_qty items._id")
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
}

export default MaterialService;