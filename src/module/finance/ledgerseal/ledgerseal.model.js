import mongoose from "mongoose";

// ── Ledger Seal (Tamper-Evident Hash Chain) ─────────────────────────────────
//
// Append-only chain of SHA-256 hashes over approved JournalEntry records.
// Each seal commits one JE into the chain:
//
//   content_hash = H( canonical(je.fields + sorted lines) )
//   chain_hash   = H( prev_chain_hash || content_hash )
//
// Any later edit to a sealed JE recomputes a different content_hash, breaks
// the chain, and is flagged by the verifier. The seal itself can't be
// rewritten without recomputing every subsequent chain_hash — which also
// breaks verification, because the latest chain_hash is what auditors snapshot
// externally (print, email to auditor, post to blockchain, etc).

const LedgerSealSchema = new mongoose.Schema(
  {
    sequence:      { type: Number, required: true, unique: true },  // monotonic
    je_ref:        { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", required: true, unique: true },
    je_no:         { type: String, required: true },
    je_date:       { type: Date,   required: true },

    content_hash:  { type: String, required: true },   // H(JE contents)
    prev_hash:     { type: String, default: "" },      // chain_hash of prior seal ("" for genesis)
    chain_hash:    { type: String, required: true },   // H(prev_hash + content_hash)

    sealed_at:     { type: Date, default: Date.now },
  },
  { timestamps: true },
);

LedgerSealSchema.index({ je_date: 1 });
LedgerSealSchema.index({ sequence: 1 });

const LedgerSealModel = mongoose.model("LedgerSeal", LedgerSealSchema);
export default LedgerSealModel;
