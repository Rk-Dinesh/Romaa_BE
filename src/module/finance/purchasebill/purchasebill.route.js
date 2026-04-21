import { Router } from "express";
import { getBills, getBillsByTender, getTenderSummary, getAllTendersSummary, getNextDocId, createPurchaseBill, approvePurchaseBill, getPurchaseBillById, updatePurchaseBill, deletePurchaseBill } from "./purchasebill.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { validate } from "../../../common/validate.js";
import { CreatePurchaseBillSchema, UpdatePurchaseBillSchema } from "../finance.schemas.js";

const purchaseBillRouter = Router();

/**
 * @swagger
 * /purchasebill/list:
 *   get:
 *     summary: List purchase bills with pagination and filters
 *     tags: [Purchase Bills]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, pending, approved, cancelled] }
 *       - in: query
 *         name: vendor_id
 *         schema: { type: string }
 *       - in: query
 *         name: tender_id
 *         schema: { type: string }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: invoice_no
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated list of purchase bills
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /purchasebill/list?from_date=&to_date=&doc_id=&tender_id=&vendor_id=&tax_mode=&invoice_no=&status=
purchaseBillRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getBills
);

// GET /purchasebill/by-tender/:tenderId
purchaseBillRouter.get(
  "/by-tender/:tenderId",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getBillsByTender
);

// GET /purchasebill/summary-all
purchaseBillRouter.get(
  "/summary-all",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getAllTendersSummary
);

// GET /purchasebill/summary/:tenderId
purchaseBillRouter.get(
  "/summary/:tenderId",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getTenderSummary
);

// GET /purchasebill/next-id?tender_id=T001
purchaseBillRouter.get(
  "/next-id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getNextDocId
);

/**
 * @swagger
 * /purchasebill/create:
 *   post:
 *     summary: Create a new purchase bill
 *     tags: [Purchase Bills]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vendor_id, line_items]
 *             properties:
 *               vendor_id:
 *                 type: string
 *                 example: "VND-001"
 *               tender_id:
 *                 type: string
 *               invoice_no:
 *                 type: string
 *               invoice_date:
 *                 type: string
 *                 format: date
 *               doc_date:
 *                 type: string
 *                 format: date
 *               credit_days:
 *                 type: integer
 *               narration:
 *                 type: string
 *               line_items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_description: { type: string }
 *                     accepted_qty: { type: number }
 *                     unit_price: { type: number }
 *                     cgst_pct: { type: number }
 *                     sgst_pct: { type: number }
 *                     igst_pct: { type: number }
 *     responses:
 *       201:
 *         description: Purchase bill created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400:
 *         description: Validation error or duplicate invoice
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 */
// POST /purchasebill/create
purchaseBillRouter.post(
  "/create",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "create"),
  validate(CreatePurchaseBillSchema),
  createPurchaseBill
);

/**
 * @swagger
 * /purchasebill/approve/{id}:
 *   patch:
 *     summary: Approve a pending purchase bill
 *     tags: [Purchase Bills]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the purchase bill
 *     responses:
 *       200:
 *         description: Bill approved, ledger and JE posted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean }
 *                 data: { type: object }
 *       400:
 *         description: Invalid transition or approval pending
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Bill not found
 */
// PATCH /purchasebill/approve/:id
purchaseBillRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "edit"),
  approvePurchaseBill
);

// PATCH /purchasebill/update/:id
purchaseBillRouter.patch(
  "/update/:id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "edit"),
  validate(UpdatePurchaseBillSchema),
  updatePurchaseBill
);

/**
 * @swagger
 * /purchasebill/delete/{id}:
 *   delete:
 *     summary: Soft-delete a draft or pending purchase bill
 *     tags: [Purchase Bills]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the purchase bill
 *     responses:
 *       200:
 *         description: Bill soft-deleted, GRN locks released
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     deleted: { type: boolean }
 *                     doc_id: { type: string }
 *       400:
 *         description: Cannot delete an approved bill
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Bill not found
 */
// DELETE /purchasebill/delete/:id
purchaseBillRouter.delete(
  "/delete/:id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "delete"),
  deletePurchaseBill
);

/**
 * @swagger
 * /purchasebill/{id}:
 *   get:
 *     summary: Get a purchase bill by ID (full detail)
 *     tags: [Purchase Bills]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the purchase bill
 *     responses:
 *       200:
 *         description: Full purchase bill document including line_items and tax_groups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean }
 *                 data: { type: object }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Bill not found
 */
// GET /purchasebill/:id  ← must be last
purchaseBillRouter.get(
  "/:id",
  verifyJWT,
  verifyPermission("finance", "purchase_bill", "read"),
  getPurchaseBillById
);

export default purchaseBillRouter;
