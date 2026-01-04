import materialService from "./material.service.js";

/**
 * Controller: Receive Materials (Inward)
 * Payload: { tender_id, received_items: [], purchase_request_id (opt), received_by (opt) }
 */
export const addMaterialReceived = async (req, res) => {
  try {
    const result = await materialService.addMaterialReceived(req.body);
    res.status(200).json({ 
      success: true, 
      message: result.message,
      data: result 
    });
  } catch (error) {
    console.error("Error receiving material:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Issue Materials (Outward)
 * Payload: { tender_id, issued_items: [], issued_by (opt) }
 */
export const addMaterialIssued = async (req, res) => {
  try {
    const result = await materialService.addMaterialIssued(req.body);
    res.status(200).json({ 
      success: true, 
      message: result.message,
      details: result.details 
    });
  } catch (error) {
    console.error("Error issuing material:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Get Stock Dashboard
 * Returns current stock vs budget status for all items.
 */
export const getStockStatus = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const { category } = req.query; // Optional filter

    const result = await materialService.getMaterialStockStatus(tender_id, category);

    res.status(200).json({
      success: true,
      data: result.stock_data,
      total_items: result.total_items
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Get Ledger History for Specific Item
 * Returns combined chronological history of IN/OUT transactions.
 */
export const getItemLedger = async (req, res) => {
  try {
    const { tender_id, item_id } = req.params;
    
    const result = await materialService.getItemLedger(tender_id, item_id);

    res.status(200).json({
      success: true,
      item_name: result.item_name,
      current_stock: result.current_stock,
      history: result.history
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Get Basic Material List
 * useful for creating POs or dropdowns
 */
export const getMaterialList = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const result = await materialService.getMaterialList(tender_id);
    
    res.status(200).json({
      success: true,
      data: result.materials,
      count: result.count
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};