import LedgerService from "./ledger.service.js";

// GET /ledger/supplier/:supplierId
// ?supplier_type=Vendor|Contractor&tender_id=&vch_type=&from_date=&to_date=
export const getSupplierLedger = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { supplier_type, tender_id, vch_type, from_date, to_date } = req.query;
    const data = await LedgerService.getSupplierLedger(supplierId, {
      supplier_type, tender_id, vch_type, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /ledger/balance/:supplierId
// ?supplier_type=Vendor|Contractor&tender_id=
export const getSupplierBalance = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { supplier_type, tender_id } = req.query;
    const data = await LedgerService.getSupplierBalance(supplierId, {
      supplier_type, tender_id,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /ledger/summary
// ?supplier_type=Vendor|Contractor&only_outstanding=true
export const getAllSupplierBalances = async (req, res) => {
  try {
    const { supplier_type, only_outstanding } = req.query;
    const data = await LedgerService.getAllSupplierBalances({
      supplier_type,
      only_outstanding: only_outstanding === "true",
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /ledger/tender/:tenderId
// ?supplier_id=&supplier_type=&vch_type=&from_date=&to_date=
export const getTenderLedger = async (req, res) => {
  try {
    const { tenderId } = req.params;
    if (!tenderId) return res.status(400).json({ status: false, message: "tenderId is required" });

    const { supplier_id, supplier_type, vch_type, from_date, to_date } = req.query;
    const data = await LedgerService.getTenderLedger(tenderId, {
      supplier_id, supplier_type, vch_type, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
