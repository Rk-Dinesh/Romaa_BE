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

// GET /ledger/statement/:supplierId
// ?supplier_type=&tender_id=&financial_year=25-26
export const getSupplierStatement = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { supplier_type, tender_id, financial_year } = req.query;
    const data = await LedgerService.getSupplierStatement(supplierId, {
      supplier_type, tender_id, financial_year,
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

// GET /ledger/tender-balance/:tenderId
// ?supplier_type=Vendor|Contractor
export const getTenderBalance = async (req, res) => {
  try {
    const { tenderId } = req.params;
    if (!tenderId) return res.status(400).json({ status: false, message: "tenderId is required" });

    const { supplier_type } = req.query;
    const data = await LedgerService.getTenderBalance(tenderId, { supplier_type });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /ledger/trial-balance?financial_year=&from_date=&to_date=
export const getTrialBalance = async (req, res) => {
  try {
    const { financial_year, from_date, to_date } = req.query;
    const data = await LedgerService.getTrialBalance({ financial_year, from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /ledger/account/:accountCode?from_date=&to_date=&financial_year=
export const getAccountLedger = async (req, res) => {
  try {
    const { accountCode } = req.params;
    const { from_date, to_date, financial_year } = req.query;
    const data = await LedgerService.getAccountLedger(accountCode, { from_date, to_date, financial_year });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /ledger/cash-book?from_date=&to_date=&financial_year=
export const getCashBook = async (req, res) => {
  try {
    const { from_date, to_date, financial_year } = req.query;
    const data = await LedgerService.getCashBook({ from_date, to_date, financial_year });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /ledger/itc-register?financial_year=&from_date=&to_date=
export const getITCRegister = async (req, res) => {
  try {
    const { financial_year, from_date, to_date } = req.query;
    const data = await LedgerService.getITCRegister({ financial_year, from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
