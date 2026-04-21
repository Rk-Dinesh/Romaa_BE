import Gstr2bUploadModel from "./gstr2bupload.model.js";
import PurchaseBillModel from "../purchasebill/purchasebill.model.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Normalisation helpers ────────────────────────────────────────────────────
// Invoice numbers, GSTINs, and dates from GSTN portals can have stray
// whitespace, mixed case, or differ in punctuation. Normalize aggressively
// before comparing — but keep originals intact for display.
const normInv  = (s) => String(s || "").trim().toUpperCase().replace(/[\s\-/.]+/g, "");
const normGst  = (s) => String(s || "").trim().toUpperCase();
const sameDate = (a, b) => {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getUTCFullYear() === db.getUTCFullYear()
      && da.getUTCMonth()    === db.getUTCMonth()
      && da.getUTCDate()     === db.getUTCDate();
};
const close = (a, b, tol = 1) => Math.abs((a ?? 0) - (b ?? 0)) <= tol; // ₹1 tolerance for rounding

// ── Period bounds for "MM-YYYY" → first/last day ─────────────────────────────
function periodBounds(return_period) {
  if (!/^\d{2}-\d{4}$/.test(return_period)) {
    throw new Error("return_period must be 'MM-YYYY' (e.g. '04-2026')");
  }
  const [mm, yyyy] = return_period.split("-").map(Number);
  return {
    from: new Date(yyyy, mm - 1, 1, 0, 0, 0, 0),
    to:   new Date(yyyy, mm,     0, 23, 59, 59, 999),
  };
}

// ── Tax aggregation on a PurchaseBill ────────────────────────────────────────
function billTaxTotals(bill) {
  const cgst = (bill.tax_groups || []).reduce((s, g) => s + (g.cgst_amt || 0), 0);
  const sgst = (bill.tax_groups || []).reduce((s, g) => s + (g.sgst_amt || 0), 0);
  const igst = (bill.tax_groups || []).reduce((s, g) => s + (g.igst_amt || 0), 0);
  return { cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst) };
}

class GstMatcherService {

  // ── Upload a 2A/2B period file ───────────────────────────────────────────
  //
  // Body: {
  //   return_period: "04-2026",
  //   source: "GSTR-2A" | "GSTR-2B",
  //   company_gstin?, original_filename?, file_format?,
  //   notes?,
  //   entries: [ { supplier_gstin, invoice_no, invoice_date, ... }, ... ]
  // }
  //
  // Re-uploads for the same period auto-deactivate prior versions so
  // "active" snapshot is unambiguous.
  static async upload(payload) {
    const {
      return_period, source = "GSTR-2B", company_gstin = "",
      original_filename = "", file_format = "json",
      notes = "", entries = [], uploaded_by = null,
    } = payload;

    if (!return_period) throw new Error("return_period is required (MM-YYYY)");
    periodBounds(return_period); // validate format
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("entries[] is required and must be non-empty");
    }

    // Validate every entry has the minimum keys
    const cleaned = entries.map((e, i) => {
      if (!e.supplier_gstin) throw new Error(`Row ${i + 1}: supplier_gstin is required`);
      if (!e.invoice_no)     throw new Error(`Row ${i + 1}: invoice_no is required`);
      if (!e.invoice_date)   throw new Error(`Row ${i + 1}: invoice_date is required`);
      return {
        supplier_gstin: normGst(e.supplier_gstin),
        supplier_name:  e.supplier_name || "",
        doc_type:       e.doc_type || "INV",
        invoice_no:     String(e.invoice_no),
        invoice_date:   new Date(e.invoice_date),
        place_of_supply:e.place_of_supply || "",
        reverse_charge: !!e.reverse_charge,
        invoice_value:  Number(e.invoice_value) || 0,
        taxable_value:  Number(e.taxable_value) || 0,
        cgst_amt:       Number(e.cgst_amt) || 0,
        sgst_amt:       Number(e.sgst_amt) || 0,
        igst_amt:       Number(e.igst_amt) || 0,
        cess_amt:       Number(e.cess_amt) || 0,
        rate_pct:       Number(e.rate_pct) || 0,
        itc_eligible:   e.itc_eligible !== false, // default true
        itc_reason:     e.itc_reason || "",
        filing_period:  e.filing_period || "",
        filing_date:    e.filing_date ? new Date(e.filing_date) : null,
      };
    });

    // Deactivate prior uploads for the same period+source
    await Gstr2bUploadModel.updateMany(
      { return_period, source, is_active: true },
      { $set: { is_active: false } }
    );

    const doc = await Gstr2bUploadModel.create({
      return_period,
      source,
      company_gstin,
      original_filename,
      file_format,
      notes,
      entries: cleaned,
      uploaded_by,
      is_active: true,
    });

    return doc.toObject();
  }

  // ── List uploads ─────────────────────────────────────────────────────────
  static async list(filters = {}) {
    const q = {};
    if (filters.return_period) q.return_period = filters.return_period;
    if (filters.source)        q.source        = filters.source;
    if (filters.is_active !== undefined) {
      q.is_active = filters.is_active === "true" || filters.is_active === true;
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Gstr2bUploadModel.find(q)
        .select("-entries") // heavy field — fetched separately via getById
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Gstr2bUploadModel.countDocuments(q),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  static async getById(id) {
    const doc = await Gstr2bUploadModel.findById(id).lean();
    if (!doc) throw new Error("GSTR upload not found");
    return doc;
  }

  // ── Run the matcher for a period ─────────────────────────────────────────
  //
  // Compares the active 2A/2B upload for the period against approved
  // PurchaseBills whose doc_date falls in the same period. Updates each
  // upload entry with match_status and writes an audit summary on the
  // upload doc itself.
  //
  // Output:
  //   {
  //     upload: { id, return_period, source, ... },
  //     matched:          [{ entry, bill }],
  //     mismatched:       [{ entry, bill, reasons }],
  //     missing_in_books: [{ entry }],
  //     missing_in_2b:    [{ bill }],
  //     summary: { ... },
  //     itc_at_risk: <number — ITC claimed in books but missing/mismatched in 2B>,
  //   }
  static async runMatch({ return_period, source = "GSTR-2B" }) {
    if (!return_period) throw new Error("return_period is required");

    const upload = await Gstr2bUploadModel.findOne({ return_period, source, is_active: true });
    if (!upload) throw new Error(`No active ${source} upload found for ${return_period}`);

    const { from, to } = periodBounds(return_period);

    const bills = await PurchaseBillModel.find({
      status: "approved",
      doc_date: { $gte: from, $lte: to },
    }).lean();

    // Build index over bills: gstin → invNo → [bills]  (multiple matches possible
    // if the same vendor has duplicate invoice numbers, which would itself be a flag)
    const billIdx = new Map();
    for (const b of bills) {
      const k = `${normGst(b.vendor_gstin)}|${normInv(b.invoice_no)}`;
      if (!billIdx.has(k)) billIdx.set(k, []);
      billIdx.get(k).push(b);
    }

    const matched          = [];
    const mismatched       = [];
    const missingInBooks   = [];
    const matchedBillIds   = new Set();
    let   itcAtRisk        = 0;

    for (let i = 0; i < upload.entries.length; i++) {
      const e = upload.entries[i];
      const k = `${normGst(e.supplier_gstin)}|${normInv(e.invoice_no)}`;
      const candidates = billIdx.get(k) || [];

      if (candidates.length === 0) {
        // In 2B but not in books — vendor filed but we never recorded it
        e.match_status     = "missing_in_books";
        e.matched_bill_ref = null;
        e.matched_bill_no  = "";
        e.mismatch_reasons = [];
        missingInBooks.push({ entry_index: i, entry: e.toObject ? e.toObject() : e });
        continue;
      }

      // Pick best candidate — exact-amount match preferred, else first
      const billTax = (b) => billTaxTotals(b);
      let bestBill  = candidates[0];
      let bestScore = -1;
      for (const c of candidates) {
        const t  = billTax(c);
        let score = 0;
        if (close(c.grand_total, e.taxable_value)) score += 4;
        if (close(t.cgst, e.cgst_amt)) score += 1;
        if (close(t.sgst, e.sgst_amt)) score += 1;
        if (close(t.igst, e.igst_amt)) score += 2;
        if (sameDate(c.doc_date, e.invoice_date)) score += 2;
        if (score > bestScore) { bestScore = score; bestBill = c; }
      }

      const t = billTax(bestBill);
      const reasons = [];
      if (!close(bestBill.grand_total, e.taxable_value)) reasons.push("taxable_value_differs");
      if (!close(t.cgst, e.cgst_amt))   reasons.push("cgst_differs");
      if (!close(t.sgst, e.sgst_amt))   reasons.push("sgst_differs");
      if (!close(t.igst, e.igst_amt))   reasons.push("igst_differs");
      if (!sameDate(bestBill.doc_date, e.invoice_date)) reasons.push("invoice_date_differs");

      e.matched_bill_ref = bestBill._id;
      e.matched_bill_no  = bestBill.doc_id || bestBill.invoice_no || "";
      matchedBillIds.add(String(bestBill._id));

      if (reasons.length === 0) {
        e.match_status     = "matched";
        e.mismatch_reasons = [];
        matched.push({
          entry_index: i,
          entry: e.toObject ? e.toObject() : e,
          bill: { _id: bestBill._id, doc_id: bestBill.doc_id, invoice_no: bestBill.invoice_no, doc_date: bestBill.doc_date, grand_total: bestBill.grand_total, ...t },
        });
      } else {
        e.match_status     = "mismatched";
        e.mismatch_reasons = reasons;
        // ITC at risk = the GST portion the books claim that doesn't tie out
        const bookItc = t.cgst + t.sgst + t.igst;
        const portalItc = (e.cgst_amt || 0) + (e.sgst_amt || 0) + (e.igst_amt || 0);
        itcAtRisk += Math.max(0, bookItc - portalItc);
        mismatched.push({
          entry_index: i,
          entry: e.toObject ? e.toObject() : e,
          bill:  { _id: bestBill._id, doc_id: bestBill.doc_id, invoice_no: bestBill.invoice_no, doc_date: bestBill.doc_date, grand_total: bestBill.grand_total, ...t },
          reasons,
        });
      }
    }

    // Bills in books that have no matching 2B entry — vendor hasn't filed
    // GSTR-1 yet, OR vendor's GSTIN/invoice number was recorded incorrectly.
    const missingIn2b = [];
    for (const b of bills) {
      if (!matchedBillIds.has(String(b._id))) {
        const t = billTaxTotals(b);
        const bookItc = t.cgst + t.sgst + t.igst;
        itcAtRisk += bookItc;
        missingIn2b.push({
          bill: {
            _id:           b._id,
            doc_id:        b.doc_id,
            invoice_no:    b.invoice_no,
            doc_date:      b.doc_date,
            vendor_id:     b.vendor_id,
            vendor_gstin:  b.vendor_gstin,
            vendor_name:   b.vendor_name,
            grand_total:   b.grand_total,
            ...t,
            book_itc:      r2(bookItc),
          },
        });
      }
    }

    upload.last_matched_at = new Date();
    upload.match_summary = {
      matched_count:          matched.length,
      mismatched_count:       mismatched.length,
      missing_in_books_count: missingInBooks.length,
      missing_in_2b_count:    missingIn2b.length,
    };
    await upload.save();

    return {
      upload: {
        _id:           upload._id,
        return_period: upload.return_period,
        source:        upload.source,
        company_gstin: upload.company_gstin,
        last_matched_at: upload.last_matched_at,
      },
      summary: {
        period_window:    { from, to },
        portal_entries:   upload.entries.length,
        book_bills:       bills.length,
        matched_count:    matched.length,
        mismatched_count: mismatched.length,
        missing_in_books: missingInBooks.length,
        missing_in_2b:    missingIn2b.length,
        itc_at_risk:      r2(itcAtRisk),
      },
      matched,
      mismatched,
      missing_in_books: missingInBooks,
      missing_in_2b:    missingIn2b,
    };
  }

  // ── Manual link/unlink for cases the auto-matcher couldn't resolve ───────
  static async manualLink({ upload_id, entry_index, bill_id }) {
    const upload = await Gstr2bUploadModel.findById(upload_id);
    if (!upload) throw new Error("Upload not found");
    if (entry_index < 0 || entry_index >= upload.entries.length) {
      throw new Error("entry_index out of bounds");
    }

    const bill = await PurchaseBillModel.findById(bill_id).lean();
    if (!bill) throw new Error("PurchaseBill not found");

    const e = upload.entries[entry_index];
    const t = billTaxTotals(bill);
    const reasons = [];
    if (!close(bill.grand_total, e.taxable_value)) reasons.push("taxable_value_differs");
    if (!close(t.cgst, e.cgst_amt))   reasons.push("cgst_differs");
    if (!close(t.sgst, e.sgst_amt))   reasons.push("sgst_differs");
    if (!close(t.igst, e.igst_amt))   reasons.push("igst_differs");
    if (!sameDate(bill.doc_date, e.invoice_date)) reasons.push("invoice_date_differs");

    e.match_status     = reasons.length === 0 ? "matched" : "mismatched";
    e.mismatch_reasons = reasons;
    e.matched_bill_ref = bill._id;
    e.matched_bill_no  = bill.doc_id || bill.invoice_no || "";
    await upload.save();

    return { match_status: e.match_status, mismatch_reasons: reasons, bill: { _id: bill._id, doc_id: bill.doc_id } };
  }

  static async manualUnlink({ upload_id, entry_index }) {
    const upload = await Gstr2bUploadModel.findById(upload_id);
    if (!upload) throw new Error("Upload not found");
    if (entry_index < 0 || entry_index >= upload.entries.length) {
      throw new Error("entry_index out of bounds");
    }
    const e = upload.entries[entry_index];
    e.match_status     = "unmatched";
    e.matched_bill_ref = null;
    e.matched_bill_no  = "";
    e.mismatch_reasons = [];
    await upload.save();
    return { ok: true };
  }

  static async deleteUpload(id) {
    const doc = await Gstr2bUploadModel.findByIdAndDelete(id);
    if (!doc) throw new Error("Upload not found");
    return { deleted: true };
  }
}

export default GstMatcherService;
