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

// GET /reports/ar-aging?as_of=&tender_id=&client_id=
export const getArAging = async (req, res) => {
  try {
    const data = await ReportsService.arAging({
      as_of:     req.query.as_of || req.query.asof || req.query.todate,
      tender_id: req.query.tender_id,
      client_id: req.query.client_id,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/ap-aging?as_of=&tender_id=&vendor_id=&contractor_id=
export const getApAging = async (req, res) => {
  try {
    const data = await ReportsService.apAging({
      as_of:         req.query.as_of || req.query.asof || req.query.todate,
      tender_id:     req.query.tender_id,
      vendor_id:     req.query.vendor_id,
      contractor_id: req.query.contractor_id,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/form-26q?financial_year=25-26&quarter=Q1&tan=&deductor_name=&deductor_pan=&deductor_address=
export const getForm26Q = async (req, res) => {
  try {
    const data = await ReportsService.form26Q({
      financial_year:   req.query.financial_year || req.query.fy,
      quarter:          req.query.quarter,
      tan:              req.query.tan,
      deductor_name:    req.query.deductor_name,
      deductor_pan:     req.query.deductor_pan,
      deductor_address: req.query.deductor_address,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("required") || error.message.includes("must be") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /reports/form-26q/csv?financial_year=25-26&quarter=Q1
// Returns CSV of per-deductee records for RPU/Saral/Genius import.
export const getForm26QCsv = async (req, res) => {
  try {
    const data = await ReportsService.form26Q({
      financial_year:   req.query.financial_year || req.query.fy,
      quarter:          req.query.quarter,
      tan:              req.query.tan,
      deductor_name:    req.query.deductor_name,
      deductor_pan:     req.query.deductor_pan,
      deductor_address: req.query.deductor_address,
    });

    const headers = [
      "Sl.No", "Deductee Code", "PAN", "Deductee Name", "Section",
      "Payment Date", "Amount Paid", "TDS Rate %", "TDS Amount",
      "Surcharge", "Education Cess", "Total Tax Deducted", "Total Tax Deposited",
      "BSR Code", "Challan Date", "Challan Serial No", "Book Entry Flag",
      "Voucher No", "Tender ID",
    ];
    const escape = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of data.deductee_records) {
      lines.push([
        r.sl_no, r.deductee_code, r.pan, r.deductee_name, r.section_code,
        r.payment_date ? new Date(r.payment_date).toISOString().slice(0, 10) : "",
        r.amount_paid, r.tds_rate_pct, r.tds_amount,
        r.surcharge, r.education_cess, r.total_tax_deducted, r.total_tax_deposited,
        r.bsr_code, r.challan_date, r.challan_serial_no, r.book_entry_flag,
        r.voucher_no, r.tender_id,
      ].map(escape).join(","));
    }
    const csv = lines.join("\n");
    const filename = `Form26Q_${data.financial_year}_${data.quarter}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (error) {
    const code = error.message.includes("required") || error.message.includes("must be") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
