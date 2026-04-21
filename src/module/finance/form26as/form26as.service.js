import Form26ASEntryModel from "./form26as.model.js";
import BillingModel from "../clientbilling/clientbilling/clientbilling.model.js";
import ClientModel from "../../clients/client.model.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

function fyRange(fy) {
  const [ss, ee] = fy.split("-");
  const century  = new Date().getFullYear() >= 2100 ? 2100 : 2000;
  const startYr  = century + parseInt(ss, 10);
  const endYr    = century + parseInt(ee, 10);
  return {
    start: new Date(startYr, 3, 1, 0, 0, 0, 0),
    end:   new Date(endYr, 2, 31, 23, 59, 59, 999),
  };
}

function quarterRange(fy, q) {
  const { start } = fyRange(fy);
  const y0 = start.getFullYear();
  const qMap = {
    Q1: { m: 3,  y: y0 },      // Apr-Jun
    Q2: { m: 6,  y: y0 },      // Jul-Sep
    Q3: { m: 9,  y: y0 },      // Oct-Dec
    Q4: { m: 0,  y: y0 + 1 },  // Jan-Mar (next year)
  };
  const spec = qMap[q];
  if (!spec) throw new Error(`Invalid quarter ${q}`);
  return {
    start: new Date(spec.y, spec.m,     1,  0,  0,  0,   0),
    end:   new Date(spec.y, spec.m + 3, 0, 23, 59, 59, 999),
  };
}

// Extract TDS from ClientBilling.deductions[] — heuristic name match
function tdsFromBill(bill) {
  const deds = bill.deductions || [];
  return deds
    .filter((d) => /tds/i.test(d.description || ""))
    .reduce((s, d) => s + (d.amount || 0), 0);
}

class Form26ASService {

  // POST /form26as/upload — bulk insert (skip duplicates on composite key)
  //
  // Dedupe key: financial_year + quarter + deductor_tan + section + booked_date
  //             + amount_credited + tds_amount + challan_number.
  //
  // The earlier (TAN + date + tds_amount) key collapsed legitimate distinct
  // entries — e.g. two invoices of the same amount on the same day from the
  // same client under different sections or different challans. The wider key
  // matches how the IT department uniquely identifies a 26AS line and is
  // enforced at the DB level by `uniq_26as_entry` in form26as.model.js.
  static async upload({ entries = [], user_id = "" }) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("entries[] is required");
    }

    const prepared = entries.map((e) => ({
      financial_year: e.financial_year,
      quarter:        e.quarter,
      deductor_tan:   (e.deductor_tan || "").trim().toUpperCase(),
      deductor_name:  e.deductor_name || "",
      our_pan:        (e.our_pan || "").trim().toUpperCase(),
      section:        (e.section  || "").trim(),
      booked_date:    e.booked_date ? new Date(e.booked_date) : null,
      amount_credited: Number(e.amount_credited) || 0,
      tds_amount:     Number(e.tds_amount) || 0,
      challan_number: (e.challan_number || "").trim(),
      status_26as:    e.status_26as || "F",
      client_id:      e.client_id || "",
      uploaded_by:    user_id,
    }));

    // Pre-fetch existing rows for the (fy, quarter, TAN) slices this batch
    // touches — one query instead of N round-trips.
    const slices = [...new Set(prepared.map((r) =>
      `${r.financial_year}|${r.quarter}|${r.deductor_tan}`))]
      .map((k) => {
        const [financial_year, quarter, deductor_tan] = k.split("|");
        return { financial_year, quarter, deductor_tan };
      });

    const existing = await Form26ASEntryModel.find({ $or: slices })
      .select("financial_year quarter deductor_tan section booked_date amount_credited tds_amount challan_number")
      .lean();

    const keyOf = (r) => [
      r.financial_year, r.quarter, r.deductor_tan, r.section,
      r.booked_date ? new Date(r.booked_date).getTime() : "",
      r.amount_credited, r.tds_amount, r.challan_number,
    ].join("|");

    const seen = new Set(existing.map(keyOf));
    const toInsert = [];
    for (const row of prepared) {
      const k = keyOf(row);
      if (seen.has(k)) continue;
      seen.add(k);  // also dedupe rows duplicated inside the same batch
      toInsert.push(row);
    }

    // ordered:false → a duplicate-key race (caught by the unique index) won't
    // abort the whole batch; remaining rows still land.
    let inserted = [];
    if (toInsert.length) {
      try {
        inserted = await Form26ASEntryModel.insertMany(toInsert, { ordered: false });
      } catch (err) {
        if (err?.insertedDocs?.length) inserted = err.insertedDocs;
        else if (err?.code !== 11000) throw err;
      }
    }

    return {
      total_submitted: prepared.length,
      inserted:        inserted.length,
      skipped:         prepared.length - inserted.length,
      rows:            inserted,
    };
  }

  static async list({ financial_year, quarter, deductor_tan } = {}) {
    const q = { is_deleted: { $ne: true } };
    if (financial_year) q.financial_year = financial_year;
    if (quarter)        q.quarter = quarter;
    if (deductor_tan)   q.deductor_tan = deductor_tan.trim().toUpperCase();
    return Form26ASEntryModel.find(q).sort({ booked_date: 1 }).lean();
  }

  // GET /form26as/reconcile?financial_year=25-26&quarter=Q4
  //
  // For the selected window:
  //   - Pulls all 26AS entries
  //   - Pulls all approved ClientBillings in the same period
  //   - Matches by client (via client_id on 26AS, or TAN→client lookup)
  //   - Reports: matched, in_books_not_in_26as, in_26as_not_in_books
  static async reconcile({ financial_year, quarter }) {
    if (!financial_year) throw new Error("financial_year is required");
    const range = quarter ? quarterRange(financial_year, quarter) : fyRange(financial_year);

    const entries = await Form26ASEntryModel.find({
      financial_year,
      ...(quarter ? { quarter } : {}),
    }).lean();

    const bills = await BillingModel.find({
      status: "approved",
      bill_date: { $gte: range.start, $lte: range.end },
    })
      .select("bill_no bill_date client_id client_name net_amount grand_total deductions")
      .lean();

    // Pre-index bills by client_id
    const billsByClient = {};
    for (const b of bills) {
      const cid = b.client_id || "__unknown__";
      if (!billsByClient[cid]) billsByClient[cid] = [];
      billsByClient[cid].push({
        ...b,
        tds_booked: r2(tdsFromBill(b)),
      });
    }

    // Build TAN → client_id map from Client.tan_no
    const clients = await ClientModel.find({}).select("client_id client_name tan_no gstin pan_no").lean();
    const tanToClient = {};
    for (const c of clients) {
      if (c.tan_no) tanToClient[c.tan_no.trim().toUpperCase()] = c.client_id;
    }

    // Build reconciliation
    const matched = [];
    const only26as = [];
    const usedBills = new Set();

    for (const e of entries) {
      const inferredCid = e.client_id || tanToClient[e.deductor_tan] || "";
      const pool = billsByClient[inferredCid] || [];

      // Pick the first unmatched bill whose booked_date falls within ±30 days of the 26AS booked date
      const match = pool.find((b) => {
        if (usedBills.has(String(b._id))) return false;
        const delta = Math.abs(new Date(b.bill_date) - new Date(e.booked_date));
        return delta <= 30 * 86400000;
      });

      if (match) {
        usedBills.add(String(match._id));
        matched.push({
          tan:             e.deductor_tan,
          deductor_name:   e.deductor_name,
          section:         e.section,
          booked_date_26as: e.booked_date,
          tds_26as:        r2(e.tds_amount),
          amount_26as:     r2(e.amount_credited),
          bill_no:         match.bill_no,
          bill_date:       match.bill_date,
          tds_booked:      r2(match.tds_booked),
          amount_billed:   r2(match.grand_total || match.net_amount),
          tds_diff:        r2(e.tds_amount - match.tds_booked),
          match_quality:   e.tds_amount === match.tds_booked ? "exact"
                            : (Math.abs(e.tds_amount - match.tds_booked) / (e.tds_amount || 1)) < 0.05
                            ? "close" : "divergent",
        });
      } else {
        only26as.push({
          tan:           e.deductor_tan,
          deductor_name: e.deductor_name,
          booked_date:   e.booked_date,
          tds_amount:    r2(e.tds_amount),
          amount_credited: r2(e.amount_credited),
          inferred_client_id: inferredCid || null,
        });
      }
    }

    const onlyBooks = [];
    for (const cid of Object.keys(billsByClient)) {
      for (const b of billsByClient[cid]) {
        if (usedBills.has(String(b._id))) continue;
        if (!b.tds_booked) continue;
        onlyBooks.push({
          bill_no:    b.bill_no,
          bill_date:  b.bill_date,
          client_id:  b.client_id,
          client_name: b.client_name,
          tds_booked: r2(b.tds_booked),
          amount_billed: r2(b.grand_total || b.net_amount),
        });
      }
    }

    const summary = {
      total_26as_entries:   entries.length,
      total_billings:       bills.length,
      total_tds_26as:       r2(entries.reduce((s, e) => s + (e.tds_amount || 0), 0)),
      total_tds_booked:     r2(bills.reduce((s, b) => s + tdsFromBill(b), 0)),
      matched_count:        matched.length,
      only_in_26as:         only26as.length,
      only_in_books:        onlyBooks.length,
    };
    summary.tds_diff_overall = r2(summary.total_tds_26as - summary.total_tds_booked);
    summary.status = summary.tds_diff_overall === 0 ? "balanced" : "mismatched";

    return {
      financial_year,
      quarter: quarter || null,
      window: range,
      summary,
      matched,
      only_in_26as: only26as,
      only_in_books: onlyBooks,
    };
  }

  static async remove(id) {
    const r = await Form26ASEntryModel.findByIdAndDelete(id);
    if (!r) throw new Error("26AS entry not found");
    return { deleted: true };
  }
}

export default Form26ASService;
