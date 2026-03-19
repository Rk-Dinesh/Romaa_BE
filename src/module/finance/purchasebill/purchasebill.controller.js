import PurchaseBillService from "./purchasebill.service.js";

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
