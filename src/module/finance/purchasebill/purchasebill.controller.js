import PurchaseBillService from "./purchasebill.service.js";

// GET /purchasebill/list?from_date=&to_date=&doc_id=&tender_id=&vendor_id=&tax_mode=&invoice_no=&status=
export const getBills = async (req, res) => {
  try {
    const { from_date, to_date, doc_id, tender_id, vendor_id, tax_mode, invoice_no, status } = req.query;
    const data = await PurchaseBillService.getBills({
      from_date, to_date, doc_id, tender_id, vendor_id, tax_mode, invoice_no, status,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /purchasebill/by-tender/:tenderId?status=&vendor_id=&from_date=&to_date=&invoice_no=&tax_mode=
export const getBillsByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    if (!tenderId) return res.status(400).json({ status: false, message: "tenderId is required" });

    const { status, vendor_id, from_date, to_date, invoice_no, tax_mode } = req.query;
    const data = await PurchaseBillService.getBillsByTender(tenderId, {
      status, vendor_id, from_date, to_date, invoice_no, tax_mode,
    });
    res.status(200).json({ status: true, data });
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
