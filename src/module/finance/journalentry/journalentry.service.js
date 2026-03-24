import JournalEntryModel from "./journalentry.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import LedgerService from "../ledger/ledger.service.js";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── FY helper ─────────────────────────────────────────────────────────────────
function getFY(date) {
  const d     = new Date(date);
  const month = d.getMonth() + 1;
  const year  = d.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

// ── Validate and enrich entry lines ──────────────────────────────────────────
// Fetches each account_code from AccountTree, validates it can receive postings,
// and snapshots account_name + account_type onto each line.
async function enrichAndValidateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("A journal entry must have at least 2 lines (1 Dr + 1 Cr)");
  }

  const codes   = [...new Set(lines.map((l) => l.account_code))];
  const accounts = await AccountTreeModel.find({
    account_code: { $in: codes },
    is_deleted:   false,
  }).lean();

  const accountMap = {};
  for (const a of accounts) accountMap[a.account_code] = a;

  // Validate + enrich each line
  const enriched = lines.map((line, i) => {
    const acc = accountMap[line.account_code];

    if (!acc) {
      throw new Error(`Line ${i + 1}: account '${line.account_code}' not found in Chart of Accounts`);
    }
    if (acc.is_group) {
      throw new Error(
        `Line ${i + 1}: account '${line.account_code}' (${acc.account_name}) is a group account — ` +
        `transactions cannot be posted to group accounts. Use a leaf account instead.`
      );
    }
    if (!acc.is_posting_account) {
      throw new Error(`Line ${i + 1}: account '${line.account_code}' (${acc.account_name}) is not a posting account`);
    }

    const dr = round2(Number(line.debit_amt)  || 0);
    const cr = round2(Number(line.credit_amt) || 0);

    if (dr > 0 && cr > 0) {
      throw new Error(`Line ${i + 1}: both debit_amt and credit_amt are > 0. A line must be either Dr or Cr.`);
    }
    if (dr === 0 && cr === 0) {
      throw new Error(`Line ${i + 1}: both debit_amt and credit_amt are 0. Line has no value.`);
    }

    return {
      account_code:  line.account_code,
      account_name:  acc.account_name,
      account_type:  acc.account_type,
      dr_cr:         line.dr_cr || (dr > 0 ? "Dr" : "Cr"),
      debit_amt:     dr,
      credit_amt:    cr,
      narration:     line.narration || "",
      // Supplier cross-post fields (populated if this is a personal ledger account)
      supplier_id:   acc.linked_supplier_id   || line.supplier_id   || null,
      supplier_type: acc.linked_supplier_type || line.supplier_type || null,
      supplier_ref:  acc.linked_supplier_ref  || line.supplier_ref  || null,
    };
  });

  // Validate balance: Σ Dr = Σ Cr
  const totalDr = round2(enriched.reduce((s, l) => s + l.debit_amt,  0));
  const totalCr = round2(enriched.reduce((s, l) => s + l.credit_amt, 0));

  if (totalDr !== totalCr) {
    throw new Error(
      `Journal entry does not balance: total Debit ₹${totalDr} ≠ total Credit ₹${totalCr}. ` +
      `Difference: ₹${round2(Math.abs(totalDr - totalCr))}`
    );
  }

  return enriched;
}

// ── Post to supplier LedgerEntry for lines affecting supplier accounts ────────
// When a JE line references a personal ledger (2010-VND-001 etc.),
// we also post to the supplier LedgerEntry so the supplier payable register stays accurate.
async function crossPostToSupplierLedger(je) {
  const supplierLines = je.lines.filter(
    (l) => l.supplier_id && l.supplier_type && ["Vendor", "Contractor"].includes(l.supplier_type)
  );

  for (const line of supplierLines) {
    // Skip if already posted (idempotency — vch_ref + vch_type unique check in postEntry)
    try {
      await LedgerService.postEntry({
        supplier_type: line.supplier_type,
        supplier_id:   line.supplier_id,
        supplier_ref:  line.supplier_ref,
        supplier_name: line.account_name,
        vch_date:      je.je_date,
        vch_no:        je.je_no,
        vch_type:      "Journal",
        vch_ref:       je._id,
        particulars:   `${je.je_type} — ${je.je_no}: ${line.narration || je.narration}`,
        tender_id:     je.tender_id    || "",
        tender_ref:    je.tender_ref   || null,
        tender_name:   je.tender_name  || "",
        debit_amt:     line.debit_amt,
        credit_amt:    line.credit_amt,
      });
    } catch (err) {
      // Duplicate posting (retry scenario) — log and continue, don't fail
      if (err.message.includes("duplicate")) continue;
      throw err;
    }
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

class JournalEntryService {

  // GET /journalentry/next-no
  static async getNextJeNo() {
    const fy     = getFY(new Date());
    const prefix = `JE/${fy}/`;
    const last   = await JournalEntryModel.findOne(
      { je_no: { $regex: `^${prefix}` } },
      { je_no: 1 }
    ).sort({ createdAt: -1 });

    const seq   = last ? parseInt(last.je_no.split("/").pop(), 10) : 0;
    const je_no = `${prefix}${String(seq + 1).padStart(4, "0")}`;
    return { je_no, is_first: !last };
  }

  // GET /journalentry/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.je_type)       query.je_type       = filters.je_type;
    if (filters.status)        query.status        = filters.status;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.financial_year)query.financial_year= filters.financial_year;
    if (filters.is_reversal !== undefined) query.is_reversal = filters.is_reversal === "true";
    if (filters.je_no)         query.je_no         = filters.je_no;

    if (filters.from_date || filters.to_date) {
      query.je_date = {};
      if (filters.from_date) query.je_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.je_date.$lte = to;
      }
    }

    // Filter by account_code (find all JEs that touched a specific account)
    if (filters.account_code) {
      query["lines.account_code"] = filters.account_code;
    }

    return await JournalEntryModel.find(query)
      .sort({ je_date: -1, createdAt: -1 })
      .lean();
  }

  // GET /journalentry/:id
  static async getById(id) {
    const je = await JournalEntryModel.findById(id).lean();
    if (!je) throw new Error("Journal entry not found");
    return je;
  }

  // POST /journalentry/create
  static async create(payload) {
    if (!payload.je_no)   throw new Error("je_no is required");
    if (!payload.narration || !payload.narration.trim()) {
      throw new Error("narration is required — explain the purpose of this journal entry");
    }

    const je_date      = payload.je_date ? new Date(payload.je_date) : new Date();
    const financial_year = getFY(je_date);

    const enrichedLines = await enrichAndValidateLines(payload.lines || []);

    const doc = {
      je_no:           payload.je_no,
      je_date,
      document_year:   payload.document_year  || financial_year,
      financial_year,
      je_type:         payload.je_type        || "Adjustment",
      narration:       payload.narration.trim(),
      lines:           enrichedLines,
      tender_id:       payload.tender_id      || "",
      tender_ref:      payload.tender_ref      || null,
      tender_name:     payload.tender_name     || "",
      is_reversal:     payload.is_reversal     || false,
      reversal_of:     payload.reversal_of     || null,
      reversal_of_no:  payload.reversal_of_no  || "",
      auto_reverse_date: payload.auto_reverse_date ? new Date(payload.auto_reverse_date) : null,
      status:          payload.status          || "pending",
      created_by:      payload.created_by      || null,
    };

    const saved = await JournalEntryModel.create(doc);

    // Auto-post if created directly as approved
    if (saved.status === "approved") {
      saved.is_posted = true;
      saved.approved_at = new Date();
      await saved.save();
      await crossPostToSupplierLedger(saved);
    }

    return saved;
  }

  // PATCH /journalentry/approve/:id
  static async approve(id, approvedBy = null) {
    const je = await JournalEntryModel.findById(id);
    if (!je)                       throw new Error("Journal entry not found");
    if (je.status === "approved")  throw new Error("Already approved");
    if (!je.narration || !je.narration.trim()) {
      throw new Error("Cannot approve a journal entry without a narration");
    }

    je.status      = "approved";
    je.is_posted   = true;
    je.approved_by = approvedBy;
    je.approved_at = new Date();
    await je.save();

    await crossPostToSupplierLedger(je);

    return je;
  }

  // POST /journalentry/reverse/:id
  // Creates a new JE that is the mirror-image (Dr↔Cr swapped) of the original.
  // This is the only way to correct an approved journal entry.
  static async reverse(id, payload = {}) {
    const original = await JournalEntryModel.findById(id);
    if (!original)                       throw new Error("Journal entry not found");
    if (original.status !== "approved")  throw new Error("Only approved journal entries can be reversed");
    if (original.is_reversal)            throw new Error("A reversal entry cannot itself be reversed");

    // Check if already reversed
    const existingReversal = await JournalEntryModel.findOne({ reversal_of: original._id });
    if (existingReversal) {
      throw new Error(`Already reversed — see JE ${existingReversal.je_no}`);
    }

    const { je_no: nextJeNo } = await JournalEntryService.getNextJeNo();

    const reversalDate = payload.reversal_date ? new Date(payload.reversal_date) : new Date();
    const fy           = getFY(reversalDate);

    // Swap Dr↔Cr on every line
    const reversedLines = original.lines.map((line) => ({
      account_code:  line.account_code,
      account_name:  line.account_name,
      account_type:  line.account_type,
      dr_cr:         line.dr_cr === "Dr" ? "Cr" : "Dr",
      debit_amt:     line.credit_amt,  // swap
      credit_amt:    line.debit_amt,   // swap
      narration:     line.narration,
      supplier_id:   line.supplier_id,
      supplier_type: line.supplier_type,
      supplier_ref:  line.supplier_ref,
    }));

    const reversalDoc = {
      je_no:          nextJeNo,
      je_date:        reversalDate,
      document_year:  fy,
      financial_year: fy,
      je_type:        "Reversal",
      narration:      payload.narration || `Reversal of ${original.je_no} — ${original.narration}`,
      lines:          reversedLines,
      tender_id:      original.tender_id,
      tender_ref:     original.tender_ref,
      tender_name:    original.tender_name,
      is_reversal:    true,
      reversal_of:    original._id,
      reversal_of_no: original.je_no,
      status:         "approved",
      is_posted:      true,
      approved_at:    new Date(),
    };

    const reversal = await JournalEntryModel.create(reversalDoc);
    await crossPostToSupplierLedger(reversal);

    return reversal;
  }

  // GET /journalentry/pending-auto-reversals
  // Returns JEs with auto_reverse_date <= today that haven't been reversed yet.
  // Call this from a daily cron or admin endpoint.
  static async getPendingAutoReversals() {
    return await JournalEntryModel.find({
      auto_reverse_date: { $lte: new Date() },
      auto_reversed: false,
      status: "approved",
    }).lean();
  }

  // Process all pending auto-reversals
  static async processAutoReversals() {
    const pending = await JournalEntryService.getPendingAutoReversals();
    const results = [];

    for (const je of pending) {
      try {
        const reversal = await JournalEntryService.reverse(je._id.toString(), {
          reversal_date: je.auto_reverse_date,
          narration: `Auto-reversal of ${je.je_no} — ${je.narration}`,
        });
        // Mark original as auto-reversed
        await JournalEntryModel.findByIdAndUpdate(je._id, { auto_reversed: true });
        results.push({ original: je.je_no, reversal: reversal.je_no, status: "ok" });
      } catch (err) {
        results.push({ original: je.je_no, status: "error", message: err.message });
      }
    }

    return results;
  }
}

export default JournalEntryService;
