import crypto from "crypto";
import LedgerSealModel from "./ledgerseal.model.js";
import JournalEntryModel from "../journalentry/journalentry.model.js";

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// Canonical content string for a JE — order-independent, value-sensitive.
// Any later edit to any committed field breaks the hash.
function canonicalJE(je) {
  const lines = (je.lines || [])
    .map((l) => ({
      a: l.account_code,
      s: l.dr_cr,
      d: r2(l.debit_amt),
      c: r2(l.credit_amt),
      t: l.tender_id || "",
    }))
    .sort((x, y) => (x.a + x.s).localeCompare(y.a + y.s));
  const payload = {
    je_no: je.je_no,
    je_date: new Date(je.je_date).toISOString(),
    je_type: je.je_type,
    narration: je.narration,
    total_debit: r2(je.total_debit),
    total_credit: r2(je.total_credit),
    tender_id: je.tender_id || "",
    is_reversal: !!je.is_reversal,
    reversal_of_no: je.reversal_of_no || "",
    lines,
  };
  return JSON.stringify(payload);
}

class LedgerSealService {

  // Seal one specific approved JE — called inline from JE.approve() so each
  // approval immediately extends the chain. Idempotent: if a seal for the JE
  // already exists, returns it without re-sealing.
  static async sealOne(je) {
    if (!je || !je._id) throw new Error("sealOne requires a JE document");
    const existing = await LedgerSealModel.findOne({ je_ref: je._id }).lean();
    if (existing) return existing;

    const latest = await LedgerSealModel.findOne({}).sort({ sequence: -1 }).lean();
    const prevHash = latest?.chain_hash || "";
    const seq      = (latest?.sequence || 0) + 1;

    const contentHash = sha256(canonicalJE(je));
    const chainHash   = sha256(prevHash + contentHash);
    return LedgerSealModel.create({
      sequence:     seq,
      je_ref:       je._id,
      je_no:        je.je_no,
      je_date:      je.je_date,
      content_hash: contentHash,
      prev_hash:    prevHash,
      chain_hash:   chainHash,
      sealed_at:    new Date(),
    });
  }

  // Seal every approved JE that doesn't already have a seal. Returns summary.
  // Chain continues from the latest existing seal (order: createdAt asc).
  static async sealApproved() {
    const latest = await LedgerSealModel.findOne({}).sort({ sequence: -1 }).lean();
    let prevHash = latest?.chain_hash || "";
    let seq = latest?.sequence || 0;

    const sealed = await LedgerSealModel.find({}, { je_ref: 1 }).lean();
    const sealedIds = new Set(sealed.map((s) => String(s.je_ref)));

    const candidates = await JournalEntryModel.find({ status: "approved" })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const unsealed = candidates.filter((j) => !sealedIds.has(String(j._id)));

    const newSeals = [];
    for (const je of unsealed) {
      seq += 1;
      const contentHash = sha256(canonicalJE(je));
      const chainHash   = sha256(prevHash + contentHash);
      newSeals.push({
        sequence: seq,
        je_ref:   je._id,
        je_no:    je.je_no,
        je_date:  je.je_date,
        content_hash: contentHash,
        prev_hash:    prevHash,
        chain_hash:   chainHash,
        sealed_at:    new Date(),
      });
      prevHash = chainHash;
    }

    if (newSeals.length) await LedgerSealModel.insertMany(newSeals, { ordered: true });

    return {
      added: newSeals.length,
      total_seals: seq,
      latest_chain_hash: prevHash,
      first_new_seq: newSeals[0]?.sequence || null,
    };
  }

  // Replay the chain against current JE state and report anomalies.
  // Flags:
  //   content_mismatch → JE was edited after sealing
  //   chain_mismatch   → recorded chain_hash doesn't match recompute (seal itself tampered)
  //   missing_je       → JE record deleted since sealing
  static async verify({ from_date, to_date } = {}) {
    const q = {};
    if (from_date || to_date) {
      q.je_date = {};
      if (from_date) q.je_date.$gte = new Date(from_date);
      if (to_date) {
        const to = new Date(to_date); to.setHours(23, 59, 59, 999);
        q.je_date.$lte = to;
      }
    }

    const seals = await LedgerSealModel.find(q).sort({ sequence: 1 }).lean();
    if (!seals.length) return { ok: true, checked: 0, anomalies: [] };

    // Load linked JEs in one query
    const jeIds = seals.map((s) => s.je_ref);
    const jes = await JournalEntryModel.find({ _id: { $in: jeIds } }).lean();
    const jeMap = {};
    for (const j of jes) jeMap[String(j._id)] = j;

    const anomalies = [];
    let prevHash = (await LedgerSealModel.findOne({ sequence: seals[0].sequence - 1 }).lean())?.chain_hash || "";

    for (const s of seals) {
      const je = jeMap[String(s.je_ref)];
      if (!je) {
        anomalies.push({ sequence: s.sequence, je_no: s.je_no, type: "missing_je" });
        prevHash = s.chain_hash;    // keep walking
        continue;
      }
      const currentContent = sha256(canonicalJE(je));
      if (currentContent !== s.content_hash) {
        anomalies.push({
          sequence: s.sequence, je_no: s.je_no, type: "content_mismatch",
          stored: s.content_hash, recomputed: currentContent,
        });
      }
      const expectedChain = sha256(prevHash + s.content_hash);
      if (expectedChain !== s.chain_hash) {
        anomalies.push({
          sequence: s.sequence, je_no: s.je_no, type: "chain_mismatch",
          stored: s.chain_hash, recomputed: expectedChain, expected_prev: prevHash, stored_prev: s.prev_hash,
        });
      }
      prevHash = s.chain_hash;
    }

    return { ok: anomalies.length === 0, checked: seals.length, anomalies };
  }

  static async status() {
    const [latest, total] = await Promise.all([
      LedgerSealModel.findOne({}).sort({ sequence: -1 }).lean(),
      LedgerSealModel.countDocuments({}),
    ]);
    const unsealedCount = await JournalEntryModel.countDocuments({
      status: "approved",
      _id: { $nin: (await LedgerSealModel.find({}, { je_ref: 1 }).lean()).map((s) => s.je_ref) },
    });
    return {
      total_seals:       total,
      latest_sequence:   latest?.sequence || 0,
      latest_chain_hash: latest?.chain_hash || "",
      latest_je_no:      latest?.je_no || "",
      latest_sealed_at:  latest?.sealed_at || null,
      unsealed_jes:      unsealedCount,
    };
  }

  // Verify chain integrity by sequence range (no JE content re-check — pure chain walk).
  // Checks that each seal's chain_hash == H(prev_chain_hash || content_hash).
  // Returns { verified, seals_checked, broken[] }.
  static async verifyBySequence(fromSeq = 1, toSeq = null) {
    const query = toSeq
      ? { sequence: { $gte: fromSeq, $lte: toSeq } }
      : { sequence: { $gte: fromSeq } };
    const seals = await LedgerSealModel.find(query).sort({ sequence: 1 }).lean();
    const broken = [];

    // If range doesn't start at seq 1 we need the hash of the seal just before the range
    let prevHashForRange = "";
    if (seals.length > 0 && seals[0].sequence > 1) {
      const preceding = await LedgerSealModel.findOne({ sequence: seals[0].sequence - 1 }).lean();
      prevHashForRange = preceding?.chain_hash || "";
    }

    for (let i = 0; i < seals.length; i++) {
      const seal = seals[i];
      const prevHash = i === 0 ? prevHashForRange : seals[i - 1].chain_hash;
      const expected = crypto.createHash("sha256")
        .update(prevHash + seal.content_hash)
        .digest("hex");
      if (expected !== seal.chain_hash) {
        broken.push({ sequence: seal.sequence, je_no: seal.je_no, reason: "chain_hash mismatch" });
      }
    }

    return { verified: broken.length === 0, seals_checked: seals.length, broken };
  }

  // Retrieve a single seal by sequence number.
  static async getBySequence(sequence) {
    const seal = await LedgerSealModel.findOne({ sequence: Number(sequence) }).lean();
    if (!seal) throw new Error(`No seal found for sequence ${sequence}`);
    return seal;
  }

  static async list({ page = 1, limit = 50, from_date, to_date } = {}) {
    const q = {};
    if (from_date || to_date) {
      q.je_date = {};
      if (from_date) q.je_date.$gte = new Date(from_date);
      if (to_date) {
        const to = new Date(to_date); to.setHours(23, 59, 59, 999);
        q.je_date.$lte = to;
      }
    }
    const p = Math.max(1, parseInt(page, 10));
    const l = Math.max(1, parseInt(limit, 10));
    const [rows, total] = await Promise.all([
      LedgerSealModel.find(q).sort({ sequence: 1 }).skip((p - 1) * l).limit(l).lean(),
      LedgerSealModel.countDocuments(q),
    ]);
    return { total, page: p, limit: l, rows };
  }
}

export default LedgerSealService;
