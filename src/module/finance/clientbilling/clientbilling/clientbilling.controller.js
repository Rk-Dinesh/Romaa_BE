import BillingService from "./clientbilling.service.js";

// Create Bill
export const createBill = async (req, res) => {
  try {
    if (!req.body.tender_id) return res.status(400).json({ error: "Tender ID required" });
    
    const bill = await BillingService.createBill(req.body);
    res.status(201).json({ success: true, message: `Bill ${bill.bill_sequence} Created`, data: bill });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get History (The Timeline)
export const getHistory = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const history = await BillingService.getBillHistory(tender_id);
    res.status(200).json({ success: true, count: history.length, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Single Bill (Detailed View)
export const getDetails = async (req, res) => {
  try {
    const { tender_id, bill_id } = req.params;
    const bill = await BillingService.getBillDetails(tender_id, bill_id);
    if(!bill) return res.status(404).json({ error: "Bill not found" });
    res.status(200).json({ success: true, data: bill });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Approve Bill — posts to client receivable ledger
export const approveBill = async (req, res) => {
  try {
    const bill = await BillingService.approveBill(req.params.id);
    res.status(200).json({ status: true, message: "Bill approved", data: bill });
  } catch (error) {
    const code = error.message.includes("not found") ? 404
               : error.message.includes("already") || error.message.includes("cannot") ? 400
               : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};