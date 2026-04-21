// ── Statutory Deadline Notifier ─────────────────────────────────────────────
//
// Generates an Indian-FY calendar of statutory compliance deadlines so finance
// teams never miss a filing. The calendar itself is pure-compute (dates derived
// from the FY string); actual filing state is tracked in
// StatutoryDeadlineFilingModel so users can mark returns as filed and the
// calendar lights them up green.

import StatutoryDeadlineFilingModel from "./statutorydeadlineFiling.model.js";

const MS_DAY = 86400000;

function getFY(date) {
  const d     = new Date(date);
  const month = d.getMonth() + 1;
  const year  = d.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

// Convert "YY-YY" → { startYr, endYr } full years
function fyYears(fy) {
  const century = new Date().getFullYear() >= 2100 ? 2100 : 2000;
  const [ss, ee] = fy.split("-");
  return { startYr: century + parseInt(ss, 10), endYr: century + parseInt(ee, 10) };
}

function mkDate(y, m /* 1-12 */, d) {
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  // Shift Saturday (6) / Sunday (0) to next Monday
  const dow = dt.getDay();
  if (dow === 6) dt.setDate(dt.getDate() + 2);
  else if (dow === 0) dt.setDate(dt.getDate() + 1);
  return dt;
}

// Generate every deadline for a given FY. Returns [{ due_on, category,
// form_name, period_label, description }].
function buildCalendar(fy) {
  const { startYr, endYr } = fyYears(fy);
  const items = [];

  // ── GSTR-1 (monthly, due 11th of next month) ──────────────────────────
  // Covers months Apr (startYr) through Mar (endYr)
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1;                       // 4..12,1..3
    const year  = i < 9 ? startYr : endYr;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear  = month === 12 ? year + 1 : year;
    items.push({
      due_on:       mkDate(nextYear, nextMonth, 11),
      category:     "GST",
      form_name:    "GSTR-1",
      period_label: `${String(month).padStart(2, "0")}-${year}`,
      description:  "Outward supplies (sales) return",
    });
  }

  // ── GSTR-3B (monthly, due 20th of next month) ─────────────────────────
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1;
    const year  = i < 9 ? startYr : endYr;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear  = month === 12 ? year + 1 : year;
    items.push({
      due_on:       mkDate(nextYear, nextMonth, 20),
      category:     "GST",
      form_name:    "GSTR-3B",
      period_label: `${String(month).padStart(2, "0")}-${year}`,
      description:  "Monthly summary return + GST payment",
    });
  }

  // ── GSTR-9 annual return (due 31 Dec of following FY) ─────────────────
  items.push({
    due_on:       mkDate(endYr, 12, 31),
    category:     "GST",
    form_name:    "GSTR-9",
    period_label: fy,
    description:  "Annual GST return",
  });

  // ── TDS payments (monthly, due 7th of next month; Mar TDS by 30 Apr) ──
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1;
    const year  = i < 9 ? startYr : endYr;
    const isMarch = month === 3;
    const nextMonth = isMarch ? 4 : (month === 12 ? 1 : month + 1);
    const nextYear  = isMarch ? endYr : (month === 12 ? year + 1 : year);
    const dueDay = isMarch ? 30 : 7;
    items.push({
      due_on:       mkDate(nextYear, nextMonth, dueDay),
      category:     "TDS",
      form_name:    "TDS Payment (Challan 281)",
      period_label: `${String(month).padStart(2, "0")}-${year}`,
      description:  "Deposit TDS deducted during the month",
    });
  }

  // ── TDS quarterly statements (24Q/26Q) ────────────────────────────────
  const tdsQuarters = [
    { label: "Q1 (Apr-Jun)",   dueY: startYr,   dueM: 7,  dueD: 31 },
    { label: "Q2 (Jul-Sep)",   dueY: startYr,   dueM: 10, dueD: 31 },
    { label: "Q3 (Oct-Dec)",   dueY: endYr,     dueM: 1,  dueD: 31 },
    { label: "Q4 (Jan-Mar)",   dueY: endYr,     dueM: 5,  dueD: 31 },
  ];
  for (const q of tdsQuarters) {
    items.push({
      due_on:       mkDate(q.dueY, q.dueM, q.dueD),
      category:     "TDS",
      form_name:    "TDS Return (24Q/26Q)",
      period_label: `${q.label} ${fy}`,
      description:  "Quarterly TDS statement — salary (24Q) / non-salary (26Q)",
    });
  }

  // ── Form 16 / 16A (TDS certificates) ──────────────────────────────────
  items.push({
    due_on:       mkDate(endYr, 6, 15),
    category:     "TDS",
    form_name:    "Form 16",
    period_label: fy,
    description:  "Annual salary TDS certificate to employees",
  });
  for (const q of tdsQuarters) {
    items.push({
      due_on:       mkDate(q.dueY, q.dueM, Math.min(q.dueD + 15, 28)),
      category:     "TDS",
      form_name:    "Form 16A",
      period_label: `${q.label} ${fy}`,
      description:  "Quarterly non-salary TDS certificate to deductees",
    });
  }

  // ── EPF / ESIC monthly (due 15th of next month) ───────────────────────
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1;
    const year  = i < 9 ? startYr : endYr;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear  = month === 12 ? year + 1 : year;
    items.push({
      due_on:       mkDate(nextYear, nextMonth, 15),
      category:     "Payroll",
      form_name:    "EPF / ESIC Challan",
      period_label: `${String(month).padStart(2, "0")}-${year}`,
      description:  "Employee PF + ESIC contribution deposit",
    });
  }

  // ── Professional Tax (monthly for most states, due 10th of next month) ──
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1;
    const year  = i < 9 ? startYr : endYr;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear  = month === 12 ? year + 1 : year;
    items.push({
      due_on:       mkDate(nextYear, nextMonth, 10),
      category:     "Payroll",
      form_name:    "Professional Tax",
      period_label: `${String(month).padStart(2, "0")}-${year}`,
      description:  "State professional tax deposit",
    });
  }

  // ── Advance Income Tax (4 instalments) ────────────────────────────────
  items.push(
    { due_on: mkDate(startYr, 6,  15), category: "Income Tax", form_name: "Advance Tax Q1", period_label: fy, description: "15% of annual tax liability" },
    { due_on: mkDate(startYr, 9,  15), category: "Income Tax", form_name: "Advance Tax Q2", period_label: fy, description: "45% cumulative" },
    { due_on: mkDate(startYr, 12, 15), category: "Income Tax", form_name: "Advance Tax Q3", period_label: fy, description: "75% cumulative" },
    { due_on: mkDate(endYr,   3,  15), category: "Income Tax", form_name: "Advance Tax Q4", period_label: fy, description: "100% cumulative" },
  );

  // ── ITR filing — 31 Oct for audit cases, 31 Jul otherwise (we list both) ─
  items.push(
    { due_on: mkDate(endYr, 7,  31), category: "Income Tax", form_name: "ITR (non-audit)", period_label: fy, description: "Income tax return — non-audit assesses" },
    { due_on: mkDate(endYr, 10, 31), category: "Income Tax", form_name: "ITR (audit)",     period_label: fy, description: "Income tax return — tax-audit assesses" },
    { due_on: mkDate(endYr, 9,  30), category: "Income Tax", form_name: "Tax Audit Report (3CD)", period_label: fy, description: "Tax audit report u/s 44AB" },
  );

  // ── MCA annual filings (for pvt ltd / ltd companies) ──────────────────
  items.push(
    { due_on: mkDate(endYr, 10, 29), category: "MCA", form_name: "AOC-4", period_label: fy, description: "Filing of financial statements with RoC" },
    { due_on: mkDate(endYr, 11, 29), category: "MCA", form_name: "MGT-7", period_label: fy, description: "Annual return filing" },
  );

  // Sort ascending
  items.sort((a, b) => a.due_on - b.due_on);
  return items;
}

function bucketize(items, asOf) {
  const today  = new Date(asOf);
  today.setHours(0, 0, 0, 0);
  const wkEnd  = new Date(today); wkEnd.setDate(wkEnd.getDate() + 7);
  const mEnd   = new Date(today); mEnd.setDate(mEnd.getDate() + 30);

  const overdue = [], thisWeek = [], thisMonth = [], later = [];
  for (const it of items) {
    const due = new Date(it.due_on);
    const daysOut = Math.ceil((due - today) / MS_DAY);
    const row = { ...it, days_until: daysOut, overdue: daysOut < 0 };
    if (daysOut < 0) overdue.push(row);
    else if (due <= wkEnd) thisWeek.push(row);
    else if (due <= mEnd) thisMonth.push(row);
    else later.push(row);
  }
  return { overdue, this_week: thisWeek, this_month: thisMonth, later };
}

// Build a map keyed by `${fy}|${category}|${form_name}|${period_label}` so
// calendar items can be annotated with filing status in one pass.
async function loadFilingIndex(fys) {
  const rows = await StatutoryDeadlineFilingModel.find({
    financial_year: { $in: fys },
    is_deleted: { $ne: true },
  }).lean();
  const map = {};
  for (const r of rows) {
    const k = `${r.financial_year}|${r.category}|${r.form_name}|${r.period_label}`;
    map[k] = r;
  }
  return map;
}

function annotateItems(items, fy, filingIndex) {
  return items.map((it) => {
    const k = `${fy}|${it.category}|${it.form_name}|${it.period_label}`;
    const f = filingIndex[k];
    return f
      ? {
          ...it,
          filed:       true,
          filed_on:    f.filed_on,
          filing_ref:  f.filing_ref,
          amount_paid: f.amount_paid,
          late_fee:    f.late_fee,
          interest:    f.interest,
        }
      : { ...it, filed: false };
  });
}

class StatutoryDeadlineService {

  // GET /statutory-deadlines/calendar?financial_year=25-26
  static async calendar({ financial_year }) {
    const fy = financial_year || getFY(new Date());
    const items = buildCalendar(fy);
    const filings = await loadFilingIndex([fy]);
    const annotated = annotateItems(items, fy, filings);
    const filedCount = annotated.filter((x) => x.filed).length;
    return {
      financial_year: fy,
      total: annotated.length,
      filed: filedCount,
      pending: annotated.length - filedCount,
      items: annotated,
    };
  }

  // GET /statutory-deadlines/upcoming?as_of=&window_days=
  // Defaults: as_of = today, window = next 60 days. Filed items are excluded
  // from the urgency buckets (users shouldn't chase what they've already done).
  static async upcoming({ as_of, window_days = 60 } = {}) {
    const asOf = as_of ? new Date(as_of) : new Date();
    const fyNow = getFY(asOf);
    const { startYr } = fyYears(fyNow);
    const prevFy = `${String((startYr - 1) % 100).padStart(2, "0")}-${String(startYr % 100).padStart(2, "0")}`;

    const filings = await loadFilingIndex([prevFy, fyNow]);
    const all = [
      ...annotateItems(buildCalendar(prevFy), prevFy, filings),
      ...annotateItems(buildCalendar(fyNow),  fyNow,  filings),
    ];

    const upperBound = new Date(asOf.getTime() + window_days * MS_DAY);
    const filtered = all.filter((it) => it.due_on <= upperBound && !it.filed);
    const buckets = bucketize(filtered, asOf);
    return {
      as_of: asOf,
      window_days,
      counts: {
        overdue:    buckets.overdue.length,
        this_week:  buckets.this_week.length,
        this_month: buckets.this_month.length,
        later:      buckets.later.length,
      },
      ...buckets,
    };
  }

  // POST /statutory-deadlines/filings
  static async markFiled({ financial_year, category, form_name, period_label,
    filed_on, filing_ref = "", amount_paid = 0, late_fee = 0, interest = 0,
    remarks = "", user_id = "" }) {
    if (!financial_year || !category || !form_name || !period_label) {
      throw new Error("financial_year, category, form_name and period_label are all required");
    }
    if (!filed_on) throw new Error("filed_on is required");

    const doc = await StatutoryDeadlineFilingModel.findOneAndUpdate(
      { financial_year, category, form_name, period_label },
      {
        financial_year, category, form_name, period_label,
        filed_on: new Date(filed_on),
        filing_ref, amount_paid: Number(amount_paid) || 0,
        late_fee: Number(late_fee) || 0, interest: Number(interest) || 0,
        remarks, filed_by: user_id,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return doc;
  }

  static async listFilings({ financial_year, category, form_name } = {}) {
    const q = { is_deleted: { $ne: true } };
    if (financial_year) q.financial_year = financial_year;
    if (category)       q.category       = category;
    if (form_name)      q.form_name      = form_name;
    return StatutoryDeadlineFilingModel.find(q).sort({ filed_on: -1 }).lean();
  }

  static async unfile(id) {
    const r = await StatutoryDeadlineFilingModel.findByIdAndDelete(id);
    if (!r) throw new Error("Filing record not found");
    return { deleted: true };
  }
}

export default StatutoryDeadlineService;
