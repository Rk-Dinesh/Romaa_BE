import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createBulkItem,
  getAllBulkItems,
  getBulkItemById,
  updateBulkItem,
  toggleBulkItemActive,
  receiveStock,
  issueStock,
  returnStock,
  transferStock,
  markDamaged,
  scrapStock,
  adjustStock,
  getTransactions,
  getLowStockItems,
} from "./bulkinventory.controller.js";

const bulkInventoryRouter = express.Router();

bulkInventoryRouter.use(verifyJWT);

// Item CRUD
bulkInventoryRouter.post("/create",                  verifyPermission("asset", "bulk_inventory", "create"), createBulkItem);
bulkInventoryRouter.get("/getall",                   verifyPermission("asset", "bulk_inventory", "read"),   getAllBulkItems);
bulkInventoryRouter.get("/low-stock",                verifyPermission("asset", "bulk_inventory", "read"),   getLowStockItems);
bulkInventoryRouter.get("/getbyid/:itemId",          verifyPermission("asset", "bulk_inventory", "read"),   getBulkItemById);
bulkInventoryRouter.put("/update/:itemId",           verifyPermission("asset", "bulk_inventory", "edit"),   updateBulkItem);
bulkInventoryRouter.patch("/toggle-active/:itemId",  verifyPermission("asset", "bulk_inventory", "edit"),   toggleBulkItemActive);

// Stock movements — each posts a ledger row, hence "create"
bulkInventoryRouter.post("/movement/receive",        verifyPermission("asset", "bulk_inventory", "create"), receiveStock);
bulkInventoryRouter.post("/movement/issue",          verifyPermission("asset", "bulk_inventory", "create"), issueStock);
bulkInventoryRouter.post("/movement/return",         verifyPermission("asset", "bulk_inventory", "create"), returnStock);
bulkInventoryRouter.post("/movement/transfer",       verifyPermission("asset", "bulk_inventory", "create"), transferStock);
bulkInventoryRouter.post("/movement/damage",         verifyPermission("asset", "bulk_inventory", "create"), markDamaged);
bulkInventoryRouter.post("/movement/scrap",          verifyPermission("asset", "bulk_inventory", "create"), scrapStock);
bulkInventoryRouter.post("/movement/adjustment",     verifyPermission("asset", "bulk_inventory", "create"), adjustStock);

// Ledger
bulkInventoryRouter.get("/transactions",             verifyPermission("asset", "bulk_inventory", "read"),   getTransactions);

export default bulkInventoryRouter;
