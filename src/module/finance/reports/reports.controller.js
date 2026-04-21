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

// GET /reports/tender-profitability?from_date=&to_date=&tender_id=
export const getTenderProfitability = async (req, res) => {
  try {
    const data = await ReportsService.tenderProfitability({
      from_date: req.query.from_date,
      to_date:   req.query.to_date,
      tender_id: req.query.tender_id,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/ratio-analysis?as_of_date=
export const getRatioAnalysis = async (req, res) => {
  try {
    const data = await ReportsService.ratioAnalysis({ as_of_date: req.query.as_of_date });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/fund-flow?opening_date=&closing_date=
export const getFundFlow = async (req, res) => {
  try {
    const data = await ReportsService.fundFlow({
      opening_date: req.query.opening_date,
      closing_date: req.query.closing_date,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("must be after") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /reports/cash-flow-forecast?as_of=&horizon_days=&client_credit_days=&contractor_credit_days=
export const getCashFlowForecast = async (req, res) => {
  try {
    const data = await ReportsService.cashFlowForecast({
      as_of:                  req.query.as_of,
      horizon_days:           req.query.horizon_days,
      client_credit_days:     req.query.client_credit_days,
      contractor_credit_days: req.query.contractor_credit_days,
    });
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

// GET /reports/form-24q?financial_year=&quarter=&tan=&deductor_name=&deductor_pan=&deductor_address=
export const getForm24Q = async (req, res) => {
  try {
    const data = await ReportsService.form24Q({
      financial_year:    req.query.financial_year || req.query.fy,
      quarter:           req.query.quarter,
      tan:               req.query.tan,
      deductor_name:     req.query.deductor_name,
      deductor_pan:      req.query.deductor_pan,
      deductor_address:  req.query.deductor_address,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("required") || error.message.includes("must be") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /reports/form-24q/csv?financial_year=&quarter=
export const getForm24QCsv = async (req, res) => {
  try {
    const data = await ReportsService.form24Q({
      financial_year:    req.query.financial_year || req.query.fy,
      quarter:           req.query.quarter,
      tan:               req.query.tan,
      deductor_name:     req.query.deductor_name,
      deductor_pan:      req.query.deductor_pan,
      deductor_address:  req.query.deductor_address,
    });
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "sl_no", "deductee_code", "pan", "deductee_name", "emp_id", "designation",
      "section_code", "payment_month", "payment_date", "gross_salary",
      "tds_rate_pct", "tds_amount", "surcharge", "education_cess",
      "total_tax_deducted", "total_tax_deposited",
      "bsr_code", "challan_date", "challan_serial_no", "book_entry_flag",
    ];
    const lines = [headers.join(",")];
    for (const r of data.deductee_records) {
      lines.push([
        r.sl_no, r.deductee_code, r.pan, r.deductee_name, r.emp_id, r.designation,
        r.section_code, r.payment_month,
        r.payment_date ? new Date(r.payment_date).toISOString().slice(0, 10) : "",
        r.gross_salary, r.tds_rate_pct, r.tds_amount,
        r.surcharge, r.education_cess, r.total_tax_deducted, r.total_tax_deposited,
        r.bsr_code, r.challan_date, r.challan_serial_no, r.book_entry_flag,
      ].map(escape).join(","));
    }
    const csv = lines.join("\n");
    const filename = `Form24Q_${data.financial_year}_${data.quarter}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (error) {
    const code = error.message.includes("required") || error.message.includes("must be") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /reports/form-16?financial_year=&employee_id=&tan=&deductor_name=&deductor_pan=&deductor_address=
export const getForm16 = async (req, res) => {
  try {
    const data = await ReportsService.form16({
      financial_year:    req.query.financial_year || req.query.fy,
      employee_id:       req.query.employee_id,
      tan:               req.query.tan,
      deductor_name:     req.query.deductor_name,
      deductor_pan:      req.query.deductor_pan,
      deductor_address:  req.query.deductor_address,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("required") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /reports/form-16a?financial_year=&quarter=&deductee_id=&section=&tan=&deductor_name=&deductor_pan=&deductor_address=
export const getForm16A = async (req, res) => {
  try {
    const data = await ReportsService.form16A({
      financial_year:    req.query.financial_year || req.query.fy,
      quarter:           req.query.quarter,
      deductee_id:       req.query.deductee_id,
      section:           req.query.section,
      tan:               req.query.tan,
      deductor_name:     req.query.deductor_name,
      deductor_pan:      req.query.deductor_pan,
      deductor_address:  req.query.deductor_address,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("required") || error.message.includes("must be") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /reports/audit-trail?from_date=&to_date=&doc_type=&je_type=&user_id=&source_no=&je_no=&tender_id=&page=&limit=
export const getAuditTrail = async (req, res) => {
  try {
    const data = await ReportsService.auditTrail({
      from_date:  req.query.from_date || req.query.fromdate,
      to_date:    req.query.to_date   || req.query.todate,
      doc_type:   req.query.doc_type,
      je_type:    req.query.je_type,
      user_id:    req.query.user_id,
      source_no:  req.query.source_no,
      je_no:      req.query.je_no,
      tender_id:  req.query.tender_id,
      page:       req.query.page,
      limit:      req.query.limit,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /reports/audit-trail/document?source_type=PaymentVoucher&source_no=PV/25-26/0001
// or  /reports/audit-trail/document?source_type=PaymentVoucher&source_ref=<oid>
export const getAuditTrailForDocument = async (req, res) => {
  try {
    const data = await ReportsService.auditTrailForDocument({
      source_type: req.query.source_type,
      source_ref:  req.query.source_ref,
      source_no:   req.query.source_no,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("required") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /reports/gstr-9?financial_year=25-26
export const getGstr9 = async (req, res) => {
  try {
    const data = await ReportsService.gstr9({ financial_year: req.query.financial_year });
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("required") || error.message.includes("Invalid") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
