import ReportsService from "./reports.service.js";

// GET /reports/trial-balance?as_of_date=&include_zero=
export const getTrialBalance = async (req, res) => {
  try {
    const as_of_date  = req.query.as_of_date || req.query.asOfDate || req.query.todate;
    const include_zero = req.query.include_zero === "true" || req.query.include_zero === true;
    const data = await ReportsService.trialBalance({ as_of_date, include_zero });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/profit-loss?from_date=&to_date=&tender_id=
export const getProfitLoss = async (req, res) => {
  try {
    const from_date = req.query.from_date || req.query.fromdate;
    const to_date   = req.query.to_date   || req.query.todate;
    const tender_id = req.query.tender_id;
    const data = await ReportsService.profitLoss({ from_date, to_date, tender_id });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/balance-sheet?as_of_date=
export const getBalanceSheet = async (req, res) => {
  try {
    const as_of_date = req.query.as_of_date || req.query.asOfDate || req.query.todate;
    const data = await ReportsService.balanceSheet({ as_of_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/general-ledger?account_code=&from_date=&to_date=&page=&limit=
export const getGeneralLedger = async (req, res) => {
  try {
    const { account_code, page, limit } = req.query;
    const from_date = req.query.from_date || req.query.fromdate;
    const to_date   = req.query.to_date   || req.query.todate;
    const data = await ReportsService.generalLedger({
      account_code, from_date, to_date, page, limit,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("required") || error.message.includes("not found") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /reports/cash-flow?from_date=&to_date=
export const getCashFlow = async (req, res) => {
  try {
    const from_date = req.query.from_date || req.query.fromdate;
    const to_date   = req.query.to_date   || req.query.todate;
    const data = await ReportsService.cashFlow({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/gstr-1?from_date=&to_date=
export const getGstr1 = async (req, res) => {
  try {
    const from_date = req.query.from_date || req.query.fromdate;
    const to_date   = req.query.to_date   || req.query.todate;
    const data = await ReportsService.gstr1({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/gstr-2b?from_date=&to_date=
export const getGstr2b = async (req, res) => {
  try {
    const from_date = req.query.from_date || req.query.fromdate;
    const to_date   = req.query.to_date   || req.query.todate;
    const data = await ReportsService.gstr2b({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/gstr-3b?from_date=&to_date=
export const getGstr3b = async (req, res) => {
  try {
    const from_date = req.query.from_date || req.query.fromdate;
    const to_date   = req.query.to_date   || req.query.todate;
    const data = await ReportsService.gstr3b({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/itc-reversal?from_date=&to_date=
export const getItcReversalRegister = async (req, res) => {
  try {
    const from_date = req.query.from_date || req.query.fromdate;
    const to_date   = req.query.to_date   || req.query.todate;
    const data = await ReportsService.itcReversalRegister({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/tds-register?from_date=&to_date=&section=
export const getTdsRegister = async (req, res) => {
  try {
    const from_date = req.query.from_date || req.query.fromdate;
    const to_date   = req.query.to_date   || req.query.todate;
    const section   = req.query.section || "";
    const data = await ReportsService.tdsRegister({ from_date, to_date, section });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
