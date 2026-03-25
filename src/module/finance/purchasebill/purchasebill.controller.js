import PurchaseBillService from "./purchasebill.service.js";

// GET /purchasebill/list?from_date=&to_date=&doc_id=&tender_id=&vendor_id=&tax_mode=&invoice_no=&status=&page=&limit=
export const getBills = async (req, res) => {
  try {
    const { from_date, to_date, doc_id, tender_id, vendor_id, tax_mode, invoice_no, status, page, limit } = req.query;
    const result = await PurchaseBillService.getBills({
      from_date, to_date, doc_id, tender_id, vendor_id, tax_mode, invoice_no, status, page, limit,
    });
    res.status(200).json({ status: true, ...result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /purchasebill/by-tender/:tenderId?status=&vendor_id=&from_date=&to_date=&invoice_no=&tax_mode=&page=&limit=
export const getBillsByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    if (!tenderId) return res.status(400).json({ status: false, message: "tenderId is required" });

    const { status, vendor_id, from_date, to_date, invoice_no, tax_mode, page, limit } = req.query;
    const result = await PurchaseBillService.getBillsByTender(tenderId, {
      status, vendor_id, from_date, to_date, invoice_no, tax_mode, page, limit,
    });
    res.status(200).json({ status: true, ...result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /purchasebill/summary-all
export const getAllTendersSummary = async (_req, res) => {
  try {
    const data = await PurchaseBillService.getAllTendersSummary();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /purchasebill/summary/:tenderId
export const getTenderSummary = async (req, res) => {
  try {
    const { tenderId } = req.params;
    if (!tenderId) return res.status(400).json({ status: false, message: "tenderId is required" });

    const data = await PurchaseBillService.getTenderSummary(tenderId);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /purchasebill/next-id
export const getNextDocId = async (_req, res) => {
  try {
    const data = await PurchaseBillService.getNextDocId();
    res.status(200).json({ status: true, ...data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// PATCH /purchasebill/approve/:id
export const approvePurchaseBill = async (req, res) => {
  try {
    const data = await PurchaseBillService.approvePurchaseBill(req.params.id);
    res.status(200).json({ status: true, message: "Purchase bill approved and posted to ledger", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /purchasebill/create
export const createPurchaseBill = async (req, res) => {
  try {
    const data = await PurchaseBillService.createPurchaseBill(req.body);
    res.status(201).json({ status: true, message: "Purchase bill created", data });
  } catch (error) {
    const code = error.message.includes("required") || error.message.includes("already exists") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /purchasebill/:id
export const getPurchaseBillById = async (req, res) => {
  try {
    const data = await PurchaseBillService.getPurchaseBillById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /purchasebill/update/:id
export const updatePurchaseBill = async (req, res) => {
  try {
    const data = await PurchaseBillService.updatePurchaseBill(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Purchase bill updated", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot edit") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /purchasebill/delete/:id
export const deletePurchaseBill = async (req, res) => {
  try {
    const data = await PurchaseBillService.deletePurchaseBill(req.params.id);
    res.status(200).json({ status: true, message: "Purchase bill deleted", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot delete") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
