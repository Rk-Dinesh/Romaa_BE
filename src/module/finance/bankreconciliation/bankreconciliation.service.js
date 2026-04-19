import BankReconciliationModel from "./bankreconciliation.model.js";
import JournalEntryModel from "../journalentry/journalentry.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";
import FinanceCounterModel from "../FinanceCounter.model.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;
const DEFAULT_DATE_WINDOW_DAYS = 5;

function currentFY() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

async function generateStatementNo() {
  const fy = currentFY();
  const counter = await FinanceCounterModel.findByIdAndUpdate(
    `BR/${fy}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `BR/${fy}/${String(counter.seq).padStart(4, "0")}`;
}

// ── Validate that account_code is a bank/cash leaf ───────────────────────────
async function validateBankAccount(code) {
  const node = await AccountTreeModel.findOne({ account_code: code, is_deleted: false }).lean();
  if (!node)                    throw new Error(`Bank account '${code}' not found in Chart of Accounts`);
  if (node.is_group)            throw new Error(`Bank account '${code}' is a group, not a leaf`);
  if (!node.is_posting_account) throw new Error(`Bank account '${code}' is not a posting account`);
  if (!node.is_bank_cash)       throw new Error(`Bank account '${code}' is not a bank/cash account`);
  return node;
}

// ── Get all bank-side JE lines for an account in a date window ───────────────
//
// Returns flat array: { je_id, je_no, je_date, line_index, dr_cr, debit_amt,
//   credit_amt, source_type, source_no, narration }
async function getBankJELines({ bank_account_code, from_date, to_date }) {
  const match = {
    status: "approved",
    "lines.account_code": bank_account_code,
  };
  if (from_date || to_date) {
    match.je_date = {};
    if (from_date) match.je_date.$gte = new Date(from_date);
    if (to_date) {
      const to = new Date(to_date);
      to.setHours(23, 59, 59, 999);
      match.je_date.$lte = to;
    }
  }

  const jes = await JournalEntryModel.find(match)
    .select("je_no je_date lines source_type source_no")
    .lean();

  const bankLines = [];
  for (const je of jes) {
    je.lines.forEach((l, idx) => {
      if (l.account_code !== bank_account_code) return;
      bankLines.push({
        je_id:        je._id,
        je_no:        je.je_no,
        je_date:      je.je_date,
        line_index:   idx,
        dr_cr:        l.dr_cr,
        debit_amt:    Number(l.debit_amt)  || 0,
        credit_amt:   Number(l.credit_amt) || 0,
        source_type:  je.source_type || "",
        source_no:    je.source_no   || "",
        narration:    l.narration    || "",
      });
    });
  }
  return bankLines;
}

// ── Build set of (je_id|line_index) keys already matched to a statement line ─
async function getAlreadyMatchedKeys(bank_account_code, excludeStatementId = null) {
  const filter = { bank_account_code };
  if (excludeStatementId) filter._id = { $ne: excludeStatementId };
  const docs = await BankReconciliationModel.find(filter)
    .select("lines.matched_je_ref lines.matched_je_line_index lines.recon_status")
    .lean();
  const set = new Set();
  for (const d of docs) {
    for (const ln of d.lines) {
      if ((ln.recon_status === "matched" || ln.recon_status === "manual") && ln.matched_je_ref) {
        set.add(`${ln.matched_je_ref}|${ln.matched_je_line_index}`);
      }
    }
  }
  return set;
}

// ── Service ──────────────────────────────────────────────────────────────────
class BankReconciliationService {

  // GET /bankreconciliation/next-no
  static async getNextStatementNo() {
    const fy = currentFY();
    const counter = await FinanceCounterModel.findOneAndUpdate(
      { _id: `BR/${fy}` },
      {},
      { new: true, upsert: false },
    );
    const seq = (counter?.seq || 0) + 1;
    return { preview_no: `BR/${fy}/${String(seq).padStart(4, "0")}` };
  }

  // GET /bankreconciliation/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.status)            query.status            = filters.status;
    if (filters.bank_account_code) query.bank_account_code = filters.bank_account_code;
    if (filters.statement_no)      query.statement_no      = filters.statement_no;

    if (filters.from_date || filters.to_date) {
      query.statement_date_to = {};
      if (filters.from_date) query.statement_date_to.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.statement_date_to.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      BankReconciliationModel.find(query)
        .select("statement_no bank_account_code bank_account_name statement_date_from statement_date_to opening_balance closing_balance total_debits total_credits matched_count unmatched_count ignored_count status createdAt")
        .sort({ statement_date_to: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BankReconciliationModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /bankreconciliation/:id
  static async getById(id) {
    const doc = await BankReconciliationModel.findById(id).lean();
    if (!doc) throw new Error("Bank reconciliation not found");
    return doc;
  }

  // POST /bankreconciliation/create
  // payload: { bank_account_code, statement_date_from, statement_date_to,
  //   opening_balance, closing_balance, lines: [{ line_date, description,
  //   ref_no, debit_amt, credit_amt, balance }], narration, created_by }
  static async createStatement(payload) {
    if (!payload.bank_account_code) throw new Error("bank_account_code is required");
    if (!payload.statement_date_from || !payload.statement_date_to) {
      throw new Error("statement_date_from and statement_date_to are required");
    }
    const acc = await validateBankAccount(payload.bank_account_code);

    const statement_no = await generateStatementNo();
    const lines = (payload.lines || []).map((l) => ({
      line_date:    new Date(l.line_date),
      description:  l.description || "",
      ref_no:       l.ref_no      || "",
      debit_amt:    r2(l.debit_amt),
      credit_amt:   r2(l.credit_amt),
      balance:      r2(l.balance),
      recon_status: "unmatched",
    }));

    const doc = await BankReconciliationModel.create({
      statement_no,
      bank_account_code:   payload.bank_account_code,
      bank_account_name:   acc.account_name,
      statement_date_from: new Date(payload.statement_date_from),
      statement_date_to:   new Date(payload.statement_date_to),
      opening_balance:     r2(payload.opening_balance),
      closing_balance:     r2(payload.closing_balance),
      lines,
      narration:           payload.narration  || "",
      created_by:          payload.created_by || "",
    });
    return doc;
  }

  // POST /bankreconciliation/:id/lines  (append more lines later)
  static async appendLines(id, newLines = []) {
    const doc = await BankReconciliationModel.findById(id);
    if (!doc) throw new Error("Bank reconciliation not found");
    if (doc.status === "closed") throw new Error("Statement is closed; cannot append lines");

    for (const l of newLines) {
      doc.lines.push({
        line_date:    new Date(l.line_date),
        description:  l.description || "",
        ref_no:       l.ref_no      || "",
        debit_amt:    r2(l.debit_amt),
        credit_amt:   r2(l.credit_amt),
        balance:      r2(l.balance),
        recon_status: "unmatched",
      });
    }
    await doc.save();
    return doc;
  }

  // POST /bankreconciliation/:id/auto-match?window_days=5
  //
  // For each unmatched line, look for a JE bank line within ±window_days that:
  //   - has the opposite bank-side direction
  //   - has the same amount (rounded to paise)
  //   - is not already matched in another statement
  // If exactly ONE candidate matches, link it. If multiple → skip (user picks).
  static async autoMatch(id, opts = {}) {
    const windowDays = parseInt(opts.window_days) || DEFAULT_DATE_WINDOW_DAYS;
    const matchedBy  = opts.matched_by || "auto";

    const doc = await BankReconciliationModel.findById(id);
    if (!doc) throw new Error("Bank reconciliation not found");
    if (doc.status === "closed") throw new Error("Statement is closed");

    // Pull JE bank lines spanning the statement window ±N days
    const padMs   = windowDays * 86400000;
    const fromJE  = new Date(doc.statement_date_from.getTime() - padMs);
    const toJE    = new Date(doc.statement_date_to.getTime()   + padMs);

    const [bankLines, alreadyMatched] = await Promise.all([
      getBankJELines({
        bank_account_code: doc.bank_account_code,
        from_date: fromJE,
        to_date:   toJE,
      }),
      getAlreadyMatchedKeys(doc.bank_account_code, doc._id),
    ]);

    // Filter out lines already matched in another statement
    const available = bankLines.filter(bl =>
      !alreadyMatched.has(`${bl.je_id}|${bl.line_index}`)
    );

    // Also exclude lines already matched within THIS statement
    const usedThis = new Set();
    for (const ln of doc.lines) {
      if ((ln.recon_status === "matched" || ln.recon_status === "manual") && ln.matched_je_ref) {
        usedThis.add(`${ln.matched_je_ref}|${ln.matched_je_line_index}`);
      }
    }

    let matched = 0;
    let ambiguous = 0;
    const now = new Date();

    for (const sLine of doc.lines) {
      if (sLine.recon_status !== "unmatched") continue;

      // Statement DEBIT (money out) → match a JE Cr Bank line of same amount
      // Statement CREDIT (money in)  → match a JE Dr Bank line of same amount
      const isStmtDebit  = (sLine.debit_amt  || 0) > 0;
      const isStmtCredit = (sLine.credit_amt || 0) > 0;
      const stmtAmt = r2(isStmtDebit ? sLine.debit_amt : sLine.credit_amt);
      const targetSide = isStmtDebit ? "Cr" : "Dr";
      const sLineMs = new Date(sLine.line_date).getTime();
      const winMs   = windowDays * 86400000;

      const candidates = available.filter(bl => {
        const key = `${bl.je_id}|${bl.line_index}`;
        if (usedThis.has(key)) return false;
        if (bl.dr_cr !== targetSide) return false;
        const blAmt = r2(targetSide === "Dr" ? bl.debit_amt : bl.credit_amt);
        if (blAmt !== stmtAmt) return false;
        const dateDiff = Math.abs(new Date(bl.je_date).getTime() - sLineMs);
        return dateDiff <= winMs;
      });

      if (candidates.length === 1) {
        const c = candidates[0];
        sLine.recon_status         = "matched";
        sLine.matched_je_ref       = c.je_id;
        sLine.matched_je_no        = c.je_no;
        sLine.matched_je_line_index = c.line_index;
        sLine.matched_source_type  = c.source_type;
        sLine.matched_source_no    = c.source_no;
        sLine.matched_at           = now;
        sLine.matched_by           = matchedBy;
        usedThis.add(`${c.je_id}|${c.line_index}`);
        matched += 1;
      } else if (candidates.length > 1) {
        ambiguous += 1;
      }
    }

    await doc.save();
    return {
      statement_no:   doc.statement_no,
      total_lines:    doc.lines.length,
      auto_matched:   matched,
      ambiguous,                 // need manual resolution (multiple candidates)
      still_unmatched: doc.unmatched_count,
    };
  }

  // PATCH /bankreconciliation/:id/lines/:lineId/match
  // body: { je_id, je_line_index, matched_by }
  static async manualMatch(id, lineId, payload) {
    const doc = await BankReconciliationModel.findById(id);
    if (!doc) throw new Error("Bank reconciliation not found");
    if (doc.status === "closed") throw new Error("Statement is closed");

    const sLine = doc.lines.id(lineId);
    if (!sLine) throw new Error("Statement line not found");

    if (!payload.je_id) throw new Error("je_id is required");
    const je = await JournalEntryModel.findById(payload.je_id).lean();
    if (!je) throw new Error("Journal entry not found");
    if (je.status !== "approved") throw new Error("Cannot match against an unapproved journal entry");

    const idx = Number.isInteger(payload.je_line_index) ? payload.je_line_index : -1;
    const jeLine = je.lines[idx];
    if (!jeLine) throw new Error(`JE line at index ${idx} not found`);
    if (jeLine.account_code !== doc.bank_account_code) {
      throw new Error(`Selected JE line is on '${jeLine.account_code}', expected '${doc.bank_account_code}'`);
    }

    // Verify direction + amount sanity (warn, not block — manual override allowed)
    const isStmtDebit = (sLine.debit_amt || 0) > 0;
    const expectedSide = isStmtDebit ? "Cr" : "Dr";
    if (jeLine.dr_cr !== expectedSide) {
      throw new Error(`Direction mismatch: statement is ${isStmtDebit ? "DEBIT" : "CREDIT"}, JE line is ${jeLine.dr_cr}`);
    }

    // Enforce one-to-one across all reconciliations on this account
    const usedKeys = await getAlreadyMatchedKeys(doc.bank_account_code, doc._id);
    if (usedKeys.has(`${je._id}|${idx}`)) {
      throw new Error("This JE line is already matched in another statement");
    }
    for (const ln of doc.lines) {
      if (ln._id.toString() === lineId.toString()) continue;
      if ((ln.recon_status === "matched" || ln.recon_status === "manual") &&
          String(ln.matched_je_ref) === String(je._id) &&
          ln.matched_je_line_index === idx) {
        throw new Error("This JE line is already matched in this statement");
      }
    }

    sLine.recon_status         = "manual";
    sLine.matched_je_ref       = je._id;
    sLine.matched_je_no        = je.je_no;
    sLine.matched_je_line_index = idx;
    sLine.matched_source_type  = je.source_type || "";
    sLine.matched_source_no    = je.source_no   || "";
    sLine.matched_at           = new Date();
    sLine.matched_by           = payload.matched_by || "";

    await doc.save();
    return doc;
  }

  // PATCH /bankreconciliation/:id/lines/:lineId/unmatch
  static async unmatch(id, lineId) {
    const doc = await BankReconciliationModel.findById(id);
    if (!doc) throw new Error("Bank reconciliation not found");
    if (doc.status === "closed") throw new Error("Statement is closed");

    const sLine = doc.lines.id(lineId);
    if (!sLine) throw new Error("Statement line not found");

    sLine.recon_status         = "unmatched";
    sLine.matched_je_ref       = null;
    sLine.matched_je_no        = "";
    sLine.matched_je_line_index = -1;
    sLine.matched_source_type  = "";
    sLine.matched_source_no    = "";
    sLine.matched_at           = null;
    sLine.matched_by           = "";

    await doc.save();
    return doc;
  }

  // PATCH /bankreconciliation/:id/lines/:lineId/ignore
  // Mark a line as deliberately ignored (e.g. bank charge to be journalized later)
  static async ignoreLine(id, lineId, note = "") {
    const doc = await BankReconciliationModel.findById(id);
    if (!doc) throw new Error("Bank reconciliation not found");
    if (doc.status === "closed") throw new Error("Statement is closed");

    const sLine = doc.lines.id(lineId);
    if (!sLine) throw new Error("Statement line not found");

    sLine.recon_status = "ignored";
    sLine.user_note    = note;
    sLine.matched_je_ref       = null;
    sLine.matched_je_no        = "";
    sLine.matched_je_line_index = -1;
    sLine.matched_source_type  = "";
    sLine.matched_source_no    = "";

    await doc.save();
    return doc;
  }

  // PATCH /bankreconciliation/:id/close
  // Finalize the statement — locks lines from edits.
  static async closeStatement(id, closed_by = "") {
    const doc = await BankReconciliationModel.findById(id);
    if (!doc) throw new Error("Bank reconciliation not found");
    if (doc.status === "closed") throw new Error("Statement is already closed");
    if (doc.unmatched_count > 0) {
      throw new Error(`Cannot close: ${doc.unmatched_count} line(s) still unmatched. Resolve or mark as ignored.`);
    }
    doc.status    = "closed";
    doc.closed_by = closed_by;
    doc.closed_at = new Date();
    await doc.save();
    return doc;
  }

  // DELETE /bankreconciliation/:id
  static async deleteStatement(id) {
    const doc = await BankReconciliationModel.findById(id);
    if (!doc) throw new Error("Bank reconciliation not found");
    if (doc.status === "closed") throw new Error("Cannot delete a closed statement");
    await doc.deleteOne();
    return { deleted: true, statement_no: doc.statement_no };
  }

  // GET /bankreconciliation/unreconciled?bank_account_code=&from_date=&to_date=
  //
  // Lists all bank-side JE lines that are NOT yet matched against any statement.
  // Useful for closing the books — every JE line should eventually reconcile.
  static async getUnreconciledJELines({ bank_account_code, from_date, to_date }) {
    if (!bank_account_code) throw new Error("bank_account_code is required");

    const [bankLines, matchedKeys] = await Promise.all([
      getBankJELines({ bank_account_code, from_date, to_date }),
      getAlreadyMatchedKeys(bank_account_code),
    ]);

    const unreconciled = bankLines
      .filter(bl => !matchedKeys.has(`${bl.je_id}|${bl.line_index}`))
      .map(bl => ({
        je_id:        bl.je_id,
        je_no:        bl.je_no,
        je_date:      bl.je_date,
        line_index:   bl.line_index,
        dr_cr:        bl.dr_cr,
        debit_amt:    bl.debit_amt,
        credit_amt:   bl.credit_amt,
        amount:       bl.dr_cr === "Dr" ? bl.debit_amt : bl.credit_amt,
        money_flow:   bl.dr_cr === "Dr" ? "in" : "out", // company perspective
        source_type:  bl.source_type,
        source_no:    bl.source_no,
        narration:    bl.narration,
      }));

    return {
      bank_account_code,
      from_date: from_date ? new Date(from_date) : null,
      to_date:   to_date   ? new Date(to_date)   : null,
      count: unreconciled.length,
      total_in:  r2(unreconciled.filter(l => l.money_flow === "in").reduce((s, l) => s + l.amount, 0)),
      total_out: r2(unreconciled.filter(l => l.money_flow === "out").reduce((s, l) => s + l.amount, 0)),
      lines: unreconciled,
    };
  }

  // GET /bankreconciliation/summary?bank_account_code=&as_of=
  //
  // Reconciliation summary report:
  //   Book balance (from JE)        = opening + Σdebit − Σcredit on bank account
  //   Statement closing (latest BR) = closing_balance of latest closed/reconciled statement
  //   Difference                    = book − statement; should be zero at close
  static async getSummary({ bank_account_code, as_of } = {}) {
    if (!bank_account_code) throw new Error("bank_account_code is required");
    const acc = await validateBankAccount(bank_account_code);

    const asOfDate = as_of ? new Date(as_of) : new Date();
    asOfDate.setHours(23, 59, 59, 999);

    // Book movement to date
    const movement = await JournalEntryModel.aggregate([
      { $match: { status: "approved", je_date: { $lte: asOfDate } } },
      { $unwind: "$lines" },
      { $match: { "lines.account_code": bank_account_code } },
      {
        $group: {
          _id: null,
          dr: { $sum: "$lines.debit_amt"  },
          cr: { $sum: "$lines.credit_amt" },
        },
      },
    ]);
    const dr = movement[0]?.dr || 0;
    const cr = movement[0]?.cr || 0;
    // Bank is Dr-normal asset: opening (signed) + dr − cr
    const opening = acc.opening_balance_type === "Cr"
      ? -(acc.opening_balance || 0)
      :  (acc.opening_balance || 0);
    const bookBalance = r2(opening + dr - cr);

    // Latest reconciled statement <= asOfDate
    const latest = await BankReconciliationModel.findOne({
      bank_account_code,
      status: { $in: ["reconciled", "closed"] },
      statement_date_to: { $lte: asOfDate },
    })
      .sort({ statement_date_to: -1 })
      .select("statement_no statement_date_from statement_date_to closing_balance status")
      .lean();

    const stmtBalance = latest?.closing_balance ?? null;
    const difference  = stmtBalance == null ? null : r2(bookBalance - stmtBalance);

    // Outstanding items (unmatched JE bank lines, after the last reconciled date)
    const cutoff = latest ? latest.statement_date_to : null;
    const outstanding = await this.getUnreconciledJELines({
      bank_account_code,
      from_date: cutoff,
      to_date:   asOfDate,
    });

    return {
      bank_account_code,
      bank_account_name: acc.account_name,
      as_of:             asOfDate,
      book_balance:      bookBalance,
      latest_statement:  latest,
      statement_closing: stmtBalance,
      difference,                       // should be 0 when fully reconciled
      is_reconciled:     difference === 0,
      outstanding: {
        count:     outstanding.count,
        total_in:  outstanding.total_in,
        total_out: outstanding.total_out,
      },
    };
  }
}

export default BankReconciliationService;
