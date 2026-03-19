import PurchaseBillService from "./purchasebill.service.js";

export const createPurchaseBill = async (req, res) => {
  try {
    const body = req.body;

    // Bulk: array body or { bills: [...] }
    const isBulk = Array.isArray(body) || Array.isArray(body.bills);
    const items  = isBulk ? (Array.isArray(body) ? body : body.bills) : null;

    if (isBulk) {
      const data = await PurchaseBillService.createPurchaseBillBulk(items);
      return res.status(201).json({ status: true, message: `${data.length} purchase bill(s) created`, count: data.length, data });
    }

    const data = await PurchaseBillService.createPurchaseBill(body);
    return res.status(201).json({ status: true, message: "Purchase bill created", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
