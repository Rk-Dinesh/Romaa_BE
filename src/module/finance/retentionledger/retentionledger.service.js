import RetentionReleaseModel from "./retentionrelease.model.js";
import WeeklyBillingModel    from "../weeklyBilling/WeeklyBilling.model.js";
import ClientBillingModel    from "../clientbilling/clientbilling/clientbilling.model.js";
import ContractorModel       from "../../hr/contractors/contractor.model.js";
import ClientModel           from "../../clients/client.model.js";
import JournalEntryService   from "../journalentry/journalentry.service.js";
import FinanceCounterModel   from "../FinanceCounter.model.js";
import { GL }                from "../gl.constants.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// Account codes seeded in accounttree.seed.js (aliased from shared constants).
const ACC_RETENTION_PAYABLE    = GL.RETENTION_PAYABLE;    // "2040" — Cr balance
const ACC_RETENTION_RECEIVABLE = GL.RETENTION_RECEIVABLE; // "1060" — Dr balance

// ── FY helper ─────────────────────────────────────────────────────────────────
function currentFY(ref = new Date()) {
  const d   = new Date(ref);
  const mo  = d.getMonth() + 1;
  const yr  = d.getFullYear();
  const st  = mo >= 4 ? yr : yr - 1;
  return `${String(st).slice(-2)}-${String(st + 1).slice(-2)}`;
}

// ── Atomic RR number generator ────────────────────────────────────────────────
async function nextReleaseNo(release_date) {
  const fy = currentFY(release_date);
  const c  = await FinanceCounterModel.findByIdAndUpdate(
    `RR/${fy}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `RR/${fy}/${String(c.seq).padStart(4, "0")}`;
}

// Returns the appropriate bill model for a release_type side
function billModelFor(release_type) {
  return release_type === "Contractor" ? WeeklyBillingModel : ClientBillingModel;
}
// Retention-held / released / released-field names differ between the two models
function retentionFields(release_type) {
  if (release_type === "Contractor") {
    return { heldField: "retention_amt",    releasedField: "retention_released", billNoField: "bill_no" };
  }
  return   { heldField: "retention_amount", releasedField: "retention_released", billNoField: "bill_id" };
}

class RetentionLedgerService {

  // ── Outstanding retention per contractor (payable) ───────────────────────
  // Picks up approved WeeklyBilling rows with retention_amt > 0 and surfaces
  // outstanding = retention_amt − retention_released for each.
  static async getPayableOutstanding({ party_id, tender_id } = {}) {
    const filter = { status: "Approved", retention_amt: { $gt: 0 }, is_deleted: { $ne: true } };
    if (party_id)  filter.contractor_id = party_id;
    if (tender_id) filter.tender_id     = tender_id;

    const bills = await WeeklyBillingModel.find(filter)
      .select("bill_no bill_date tender_id contractor_id contractor_name retention_amt retention_released total_amount net_payable")
      .sort({ bill_date: 1 })
      .lean();

    const rows = [];
    for (const b of bills) {
      const held        = r2(b.retention_amt || 0);
      const released    = r2(b.retention_released || 0);
      const outstanding = r2(held - released);
      if (outstanding <= 0.01) continue;
      rows.push({
        bill_type:     "WeeklyBilling",
        bill_ref:      b._id,
        bill_no:       b.bill_no,
        bill_date:     b.bill_date,
        tender_id:     b.tender_id,
        party_type:    "Contractor",
        party_id:      b.contractor_id,
        party_name:    b.contractor_name,
        retention_amt: held,
        released,
        outstanding,
      });
    }

    return {
      side: "payable",
      account_code: ACC_RETENTION_PAYABLE,
      filter: { party_id: party_id || null, tender_id: tender_id || null },
      count: rows.length,
      total_held:        r2(rows.reduce((s, r) => s + r.retention_amt, 0)),
      total_released:    r2(rows.reduce((s, r) => s + r.released, 0)),
      total_outstanding: r2(rows.reduce((s, r) => s + r.outstanding, 0)),
      rows,
    };
  }

  // ── Outstanding retention per client (receivable) ────────────────────────
  static async getReceivableOutstanding({ party_id, tender_id } = {}) {
    const filter = { status: { $in: ["Approved", "Paid"] }, retention_amount: { $gt: 0 }, is_deleted: { $ne: true } };
    if (party_id)  filter.client_id = party_id;
    if (tender_id) filter.tender_id = tender_id;

    const bills = await ClientBillingModel.find(filter)
      .select("bill_id bill_date tender_id client_id client_name retention_amount retention_released net_amount grand_total")
      .sort({ bill_date: 1 })
      .lean();

    const rows = [];
    for (const b of bills) {
      const held        = r2(b.retention_amount || 0);
      const released    = r2(b.retention_released || 0);
      const outstanding = r2(held - released);
      if (outstanding <= 0.01) continue;
      rows.push({
        bill_type:        "ClientBilling",
        bill_ref:         b._id,
        bill_no:          b.bill_id,
        bill_date:        b.bill_date,
        tender_id:        b.tender_id,
        party_type:       "Client",
        party_id:         b.client_id,
        party_name:       b.client_name,
        retention_amount: held,
        released,
        outstanding,
      });
    }

    return {
      side: "receivable",
      account_code: ACC_RETENTION_RECEIVABLE,
      filter: { party_id: party_id || null, tender_id: tender_id || null },
      count: rows.length,
      total_held:        r2(rows.reduce((s, r) => s + r.retention_amount, 0)),
      total_released:    r2(rows.reduce((s, r) => s + r.released, 0)),
      total_outstanding: r2(rows.reduce((s, r) => s + r.outstanding, 0)),
      rows,
    };
  }

  // ── Summary by party (both sides) ────────────────────────────────────────
  static async getSummary({ tender_id } = {}) {
    const [pay, rec] = await Promise.all([
      RetentionLedgerService.getPayableOutstanding({ tender_id }),
      RetentionLedgerService.getReceivableOutstanding({ tender_id }),
    ]);

    const groupByParty = (rows, key) => {
      const map = {};
      for (const r of rows) {
        const k = `${r.party_type}|${r.party_id}`;
        if (!map[k]) map[k] = {
          party_type:  r.party_type,
          party_id:    r.party_id,
          party_name:  r.party_name,
          bill_count:  0,
          total_held:  0,
          total_released: 0,
          total_outstanding: 0,
          oldest_date: r.bill_date,
        };
        map[k].bill_count += 1;
        map[k].total_held  += (r.retention_amt ?? r.retention_amount ?? 0);
        map[k].total_released   += r.released;
        map[k].total_outstanding+= r.outstanding;
        if (new Date(r.bill_date) < new Date(map[k].oldest_date)) map[k].oldest_date = r.bill_date;
      }
      return Object.values(map)
        .map(v => ({ ...v, total_held: r2(v.total_held), total_released: r2(v.total_released), total_outstanding: r2(v.total_outstanding) }))
        .sort((a, b) => b.total_outstanding - a.total_outstanding);
    };

    return {
      filter: { tender_id: tender_id || null },
      payable: {
        account_code: ACC_RETENTION_PAYABLE,
        total_outstanding: pay.total_outstanding,
        by_party: groupByParty(pay.rows),
      },
      receivable: {
        account_code: ACC_RETENTION_RECEIVABLE,
        total_outstanding: rec.total_outstanding,
        by_party: groupByParty(rec.rows),
      },
      net_outstanding: r2(rec.total_outstanding - pay.total_outstanding), // +ve = we are net receiver
    };
  }

  // ── Create a release (draft: status=pending) ─────────────────────────────
  //
  // Body: {
  //   release_type: "Contractor" | "Client",
  //   release_date?, party_id, tender_id?,
  //   bill_refs: [{ bill_ref, released_amt }...],
  //   payment_mode?, bank_account_code?, bank_name?, bank_ref?,
  //   narration?
  // }
  //
  // Validates each cited bill actually has outstanding retention >= released_amt
  // and all bills belong to the same party_id. No JE yet.
  static async createRelease(payload) {
    const {
      release_type, release_date, party_id, tender_id,
      bill_refs = [], payment_mode = "NEFT",
      bank_account_code = "", bank_name = "", bank_ref = "",
      narration = "", created_by = null,
    } = payload;

    if (!["Contractor", "Client"].includes(release_type)) {
      throw new Error("release_type must be 'Contractor' or 'Client'");
    }
    if (!party_id) throw new Error("party_id is required");
    if (!Array.isArray(bill_refs) || bill_refs.length === 0) {
      throw new Error("bill_refs array with at least one bill is required");
    }

    const BillModel = billModelFor(release_type);
    const { heldField, releasedField, billNoField } = retentionFields(release_type);

    // Load bills, validate ownership, totals
    const ids = bill_refs.map(r => r.bill_ref).filter(Boolean);
    const bills = await BillModel.find({ _id: { $in: ids } }).lean();
    if (bills.length !== bill_refs.length) {
      throw new Error("One or more bill_ref IDs are invalid");
    }
    const billMap = Object.fromEntries(bills.map(b => [String(b._id), b]));

    const partyIdField = release_type === "Contractor" ? "contractor_id" : "client_id";
    const partyNameField = release_type === "Contractor" ? "contractor_name" : "client_name";

    // Resolve party_name from the first bill (all rows must share party_id)
    const first = bills[0];
    const partyName = first[partyNameField] || "";

    const refsOut = [];
    for (const r of bill_refs) {
      const amt = r2(r.released_amt);
      if (!(amt > 0)) throw new Error(`Invalid released_amt for bill_ref ${r.bill_ref}`);

      const b = billMap[String(r.bill_ref)];
      if (b[partyIdField] !== party_id) {
        throw new Error(`Bill ${b[billNoField]} belongs to ${b[partyIdField]}, not ${party_id}`);
      }
      if (tender_id && b.tender_id !== tender_id) {
        throw new Error(`Bill ${b[billNoField]} is on tender ${b.tender_id}, not ${tender_id}`);
      }
      const held     = r2(b[heldField] || 0);
      const released = r2(b[releasedField] || 0);
      const outstanding = r2(held - released);
      if (amt > outstanding + 0.01) {
        throw new Error(`Bill ${b[billNoField]}: release ${amt} exceeds outstanding retention ${outstanding}`);
      }
      refsOut.push({
        bill_type:     release_type === "Contractor" ? "WeeklyBilling" : "ClientBilling",
        bill_ref:      b._id,
        bill_no:       b[billNoField] || "",
        bill_date:     b.bill_date,
        retention_amt: held,
        released_amt:  amt,
      });
    }

    const release_no = await nextReleaseNo(release_date);
    const doc = await RetentionReleaseModel.create({
      release_no,
      release_date: release_date ? new Date(release_date) : new Date(),
      release_type,
      party_type:   release_type,
      party_id,
      party_name:   partyName,
      tender_id:    tender_id || (first.tender_id || ""),
      tender_name:  first.tender_name || "",
      bill_refs:    refsOut,
      payment_mode,
      bank_account_code,
      bank_name,
      bank_ref,
      narration:    narration || `Retention release to ${partyName}`,
      status:       "pending",
      created_by,
    });

    return doc.toObject();
  }

  // ── Approve a pending release ────────────────────────────────────────────
  //
  // Posts the JE and increments retention_released on each cited bill.
  // Contractor: Dr 2040 Retention Payable / Cr Bank
  // Client:     Dr Bank / Cr 1060 Retention Receivable
  static async approveRelease({ id, approved_by = null }) {
    const rel = await RetentionReleaseModel.findById(id);
    if (!rel) throw new Error("Retention release not found");
    if (rel.status !== "pending") throw new Error(`Release is '${rel.status}' — only 'pending' releases can be approved`);
    if (!rel.bank_account_code)    throw new Error("bank_account_code is required before approval");

    const amt = r2(rel.total_released_amt);
    if (!(amt > 0)) throw new Error("Release has zero amount");

    // Re-validate each bill still has enough outstanding (race-safe at approval time)
    const BillModel = billModelFor(rel.release_type);
    const { heldField, releasedField, billNoField } = retentionFields(rel.release_type);
    const ids  = rel.bill_refs.map(r => r.bill_ref);
    const bills = await BillModel.find({ _id: { $in: ids } });
    const billMap = Object.fromEntries(bills.map(b => [String(b._id), b]));

    for (const r of rel.bill_refs) {
      const b = billMap[String(r.bill_ref)];
      if (!b) throw new Error(`Bill ${r.bill_no} no longer exists`);
      const outstanding = r2((b[heldField] || 0) - (b[releasedField] || 0));
      if (r.released_amt > outstanding + 0.01) {
        throw new Error(`Bill ${b[billNoField]}: outstanding retention is now ${outstanding}, cannot release ${r.released_amt}`);
      }
    }

    // Build JE lines
    const jeLines = rel.release_type === "Contractor"
      ? [
          { account_code: ACC_RETENTION_PAYABLE,  dr_cr: "Dr", debit_amt: amt, credit_amt: 0, narration: `Retention released to ${rel.party_name}` },
          { account_code: rel.bank_account_code,  dr_cr: "Cr", debit_amt: 0,   credit_amt: amt, narration: `${rel.payment_mode}${rel.bank_ref ? ` ${rel.bank_ref}` : ""}` },
        ]
      : [
          { account_code: rel.bank_account_code,     dr_cr: "Dr", debit_amt: amt, credit_amt: 0, narration: `Retention received from ${rel.party_name}` },
          { account_code: ACC_RETENTION_RECEIVABLE,  dr_cr: "Cr", debit_amt: 0,   credit_amt: amt, narration: `Retention released by ${rel.party_name}` },
        ];

    const je = await JournalEntryService.createFromVoucher(jeLines, {
      je_type:     "Adjustment",
      je_date:     rel.release_date || new Date(),
      narration:   `Retention Release ${rel.release_no} — ${rel.party_name}`,
      tender_id:   rel.tender_id || "",
      tender_name: rel.tender_name || "",
      source_ref:  rel._id,
      source_type: "RetentionRelease",
      source_no:   rel.release_no,
      created_by:  approved_by,
    });

    if (!je) throw new Error("Failed to post Journal Entry for retention release — ensure account codes are valid and bank_account_code is set");

    // Bump retention_released on each bill
    for (const r of rel.bill_refs) {
      const b = billMap[String(r.bill_ref)];
      b[releasedField] = r2((b[releasedField] || 0) + r.released_amt);
      await b.save();
    }

    rel.status = "approved";
    rel.je_ref = je._id;
    rel.je_no  = je.je_no;
    rel.approved_by = approved_by;
    rel.approved_at = new Date();
    await rel.save();

    return rel.toObject();
  }

  // ── Cancel an approved or pending release ────────────────────────────────
  //
  // Pending:  simply mark cancelled.
  // Approved: post a reversing JE (swaps Dr/Cr of the original) and roll back
  //           retention_released on each cited bill.
  static async cancelRelease({ id, reason = "", cancelled_by = null }) {
    const rel = await RetentionReleaseModel.findById(id);
    if (!rel) throw new Error("Retention release not found");
    if (rel.status === "cancelled") throw new Error("Release is already cancelled");

    if (rel.status === "pending") {
      rel.status = "cancelled";
      rel.cancelled_at = new Date();
      rel.cancel_reason = reason;
      await rel.save();
      return rel.toObject();
    }

    // Approved → reverse
    const BillModel = billModelFor(rel.release_type);
    const { releasedField } = retentionFields(rel.release_type);

    const amt = r2(rel.total_released_amt);
    const jeLines = rel.release_type === "Contractor"
      ? [
          { account_code: rel.bank_account_code,  dr_cr: "Dr", debit_amt: amt, credit_amt: 0, narration: `Reversal of retention release ${rel.release_no}` },
          { account_code: ACC_RETENTION_PAYABLE,  dr_cr: "Cr", debit_amt: 0,   credit_amt: amt, narration: `Reversal — retention re-held for ${rel.party_name}` },
        ]
      : [
          { account_code: ACC_RETENTION_RECEIVABLE,  dr_cr: "Dr", debit_amt: amt, credit_amt: 0, narration: `Reversal — retention re-held by ${rel.party_name}` },
          { account_code: rel.bank_account_code,     dr_cr: "Cr", debit_amt: 0,   credit_amt: amt, narration: `Reversal of retention release ${rel.release_no}` },
        ];

    const je = await JournalEntryService.createFromVoucher(jeLines, {
      je_type:     "Reversal",
      je_date:     new Date(),
      narration:   `Cancel Retention Release ${rel.release_no}${reason ? ` — ${reason}` : ""}`,
      tender_id:   rel.tender_id || "",
      tender_name: rel.tender_name || "",
      source_ref:  rel._id,
      source_type: "RetentionRelease",
      source_no:   rel.release_no,
      created_by:  cancelled_by,
    });
    if (!je) throw new Error("Failed to post reversing Journal Entry — cancellation aborted");

    // Roll back retention_released on each bill
    const ids  = rel.bill_refs.map(r => r.bill_ref);
    const bills = await BillModel.find({ _id: { $in: ids } });
    const billMap = Object.fromEntries(bills.map(b => [String(b._id), b]));
    for (const r of rel.bill_refs) {
      const b = billMap[String(r.bill_ref)];
      if (!b) continue;
      b[releasedField] = Math.max(0, r2((b[releasedField] || 0) - r.released_amt));
      await b.save();
    }

    rel.status = "cancelled";
    rel.cancel_je_ref = je._id;
    rel.cancel_je_no  = je.je_no;
    rel.cancelled_at  = new Date();
    rel.cancel_reason = reason;
    await rel.save();

    return rel.toObject();
  }

  // ── List releases with filters ───────────────────────────────────────────
  static async list(filters = {}) {
    const q = { is_deleted: { $ne: true } };
    if (filters.release_type) q.release_type = filters.release_type;
    if (filters.status)       q.status       = filters.status;
    if (filters.party_id)     q.party_id     = filters.party_id;
    if (filters.tender_id)    q.tender_id    = filters.tender_id;
    if (filters.from_date || filters.to_date) {
      q.release_date = {};
      if (filters.from_date) q.release_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        q.release_date.$lte = to;
      }
    }
    if (filters.search) {
      const s = String(filters.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      q.$or = [
        { release_no: { $regex: s, $options: "i" } },
        { party_name: { $regex: s, $options: "i" } },
        { party_id:   { $regex: s, $options: "i" } },
        { tender_id:  { $regex: s, $options: "i" } },
      ];
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      RetentionReleaseModel.find(q).sort({ release_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      RetentionReleaseModel.countDocuments(q),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  static async getById(id) {
    const doc = await RetentionReleaseModel.findById(id).lean();
    if (!doc) throw new Error("Retention release not found");
    return doc;
  }

  // Releases that cite a specific bill
  static async getReleasesForBill({ bill_type, bill_id }) {
    if (!["WeeklyBilling", "ClientBilling"].includes(bill_type)) {
      throw new Error("bill_type must be 'WeeklyBilling' or 'ClientBilling'");
    }
    const rows = await RetentionReleaseModel.find({
      "bill_refs.bill_ref": bill_id,
      is_deleted: { $ne: true },
    }).sort({ release_date: -1 }).lean();

    return rows.map(r => {
      const ref = (r.bill_refs || []).find(x => String(x.bill_ref) === String(bill_id));
      return {
        release_id:   r._id,
        release_no:   r.release_no,
        release_date: r.release_date,
        release_type: r.release_type,
        status:       r.status,
        released_amt: ref ? r2(ref.released_amt) : 0,
        je_no:        r.je_no,
      };
    });
  }
}

export default RetentionLedgerService;
