import BulkInventoryService from "./bulkinventory.service.js";

export const createBulkItem = async (req, res) => {
  try {
    const result = await BulkInventoryService.createItem(req.body, req.user?._id);
    res.status(201).json({ status: true, message: "Bulk inventory item created", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const getAllBulkItems = async (req, res) => {
  try {
    const result = await BulkInventoryService.getAll(req.query);
    res.status(200).json({ status: true, data: result.data, meta: result.meta });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getBulkItemById = async (req, res) => {
  try {
    const result = await BulkInventoryService.getByItemId(req.params.itemId);
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const updateBulkItem = async (req, res) => {
  try {
    const result = await BulkInventoryService.update(req.params.itemId, req.body, req.user?._id);
    res.status(200).json({ status: true, message: "Bulk inventory item updated", data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const toggleBulkItemActive = async (req, res) => {
  try {
    const result = await BulkInventoryService.toggleActive(req.params.itemId, req.user?._id);
    const text = result.is_active ? "Activated" : "Deactivated";
    res.status(200).json({ status: true, message: `Item ${text}`, data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

// ── Stock movement endpoints ────────────────────────────────────────────────
const wrapMovement = (fn, successMsg) => async (req, res) => {
  try {
    const result = await fn(req.body, req.user?._id);
    res.status(201).json({ status: true, message: successMsg, data: result });
  } catch (error) {
    res.status(400).json({ status: false, message: error.message });
  }
};

export const receiveStock = wrapMovement(BulkInventoryService.receive, "Receipt posted");
export const issueStock = wrapMovement(BulkInventoryService.issue, "Issue posted");
export const returnStock = wrapMovement(BulkInventoryService.receiveReturn, "Return posted");
export const transferStock = wrapMovement(BulkInventoryService.transfer, "Transfer posted");
export const markDamaged = wrapMovement(BulkInventoryService.markDamaged, "Marked as damaged");
export const scrapStock = wrapMovement(BulkInventoryService.scrap, "Scrap posted");
export const adjustStock = wrapMovement(BulkInventoryService.adjust, "Adjustment posted");

export const getTransactions = async (req, res) => {
  try {
    const result = await BulkInventoryService.getTransactions(req.query);
    res.status(200).json({ status: true, data: result.data, meta: result.meta });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getLowStockItems = async (_req, res) => {
  try {
    const result = await BulkInventoryService.getLowStockItems();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
