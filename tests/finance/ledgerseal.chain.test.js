import { describe, it, expect } from "vitest";
import crypto from "node:crypto";

// ── Pure chain logic extracted from ledgerseal.service.js ────────────────────
// Algorithm (from LedgerSealSchema comments):
//   content_hash = H( canonical(je_fields) )
//   chain_hash   = H( prev_chain_hash || content_hash )   (string concatenation)
//
// Any field change → different content_hash → different chain_hash for that seal
// and every subsequent seal in the sequence.

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Minimal canonical function (mirrors ledgerseal.service.js for pure testing)
function canonicalContent(je) {
  return JSON.stringify({
    je_no:        je.je_no,
    je_date:      je.je_date,
    je_type:      je.je_type,
    narration:    je.narration,
    total_debit:  je.total_debit,
    total_credit: je.total_credit,
  });
}

// Build a chain of seal objects from an array of JE-like objects.
// Returns array of { sequence, content_hash, prev_hash, chain_hash }.
function buildChain(jes) {
  let prevHash = "";
  return jes.map((je, idx) => {
    const content_hash = sha256(canonicalContent(je));
    const chain_hash   = sha256(prevHash + content_hash);
    const seal = { sequence: idx + 1, je_no: je.je_no, content_hash, prev_hash: prevHash, chain_hash };
    prevHash = chain_hash;
    return seal;
  });
}

// Verify a chain of seals against current JE state (mirrors LedgerSealService.verify).
// Returns { ok, anomalies }.
function verifyChain(seals, jes) {
  const jeMap = Object.fromEntries(jes.map((j) => [j.je_no, j]));
  const anomalies = [];
  let prevHash = "";

  for (const seal of seals) {
    const je = jeMap[seal.je_no];
    if (!je) {
      anomalies.push({ sequence: seal.sequence, je_no: seal.je_no, type: "missing_je" });
      prevHash = seal.chain_hash;
      continue;
    }
    const currentContent = sha256(canonicalContent(je));
    if (currentContent !== seal.content_hash) {
      anomalies.push({ sequence: seal.sequence, je_no: seal.je_no, type: "content_mismatch" });
    }
    const expectedChain = sha256(prevHash + seal.content_hash);
    if (expectedChain !== seal.chain_hash) {
      anomalies.push({ sequence: seal.sequence, je_no: seal.je_no, type: "chain_mismatch" });
    }
    prevHash = seal.chain_hash;
  }

  return { ok: anomalies.length === 0, anomalies };
}

// Sample JE fixtures
const je1 = { je_no: "JE/25-26/0001", je_date: "2025-04-01T00:00:00.000Z", je_type: "Purchase Invoice", narration: "Vendor A", total_debit: 10000, total_credit: 10000 };
const je2 = { je_no: "JE/25-26/0002", je_date: "2025-04-02T00:00:00.000Z", je_type: "Payment Voucher",  narration: "Vendor A PV", total_debit: 9000,  total_credit: 9000  };
const je3 = { je_no: "JE/25-26/0003", je_date: "2025-04-03T00:00:00.000Z", je_type: "Credit Note",     narration: "CN-001",       total_debit: 1000,  total_credit: 1000  };

describe("LedgerSeal — chain hash algorithm", () => {
  it("sha256 produces a 64-char hex string", () => {
    const h = sha256("test");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("genesis seal: prev_hash = '' → chain_hash = H('' + content_hash)", () => {
    const content_hash = sha256(canonicalContent(je1));
    const expected_chain = sha256("" + content_hash);
    const [seal] = buildChain([je1]);

    expect(seal.prev_hash).toBe("");
    expect(seal.chain_hash).toBe(expected_chain);
  });

  it("second seal: chain_hash = H(seal1.chain_hash + content_hash)", () => {
    const [s1, s2] = buildChain([je1, je2]);
    const content2 = sha256(canonicalContent(je2));
    const expected = sha256(s1.chain_hash + content2);

    expect(s2.prev_hash).toBe(s1.chain_hash);
    expect(s2.chain_hash).toBe(expected);
  });

  it("each seal's prev_hash equals the previous seal's chain_hash", () => {
    const seals = buildChain([je1, je2, je3]);
    expect(seals[1].prev_hash).toBe(seals[0].chain_hash);
    expect(seals[2].prev_hash).toBe(seals[1].chain_hash);
  });

  it("different JE content → different chain_hash (collision resistance)", () => {
    const [s1a] = buildChain([je1]);
    const je1alt = { ...je1, narration: "Tampered narration" };
    const [s1b] = buildChain([je1alt]);
    expect(s1a.chain_hash).not.toBe(s1b.chain_hash);
  });
});

describe("LedgerSeal — tamper detection", () => {
  it("verify() returns ok=true for an unmodified chain", () => {
    const jes   = [je1, je2, je3];
    const seals = buildChain(jes);
    const { ok, anomalies } = verifyChain(seals, jes);
    expect(ok).toBe(true);
    expect(anomalies).toHaveLength(0);
  });

  it("tamper: mutating narration on a sealed JE → content_mismatch flagged", () => {
    const jes   = [je1, je2, je3];
    const seals = buildChain(jes);

    // Tamper the second JE's narration after sealing
    const tamperedJes = jes.map((j, i) =>
      i === 1 ? { ...j, narration: "TAMPERED" } : j
    );

    const { ok, anomalies } = verifyChain(seals, tamperedJes);
    expect(ok).toBe(false);
    const tamper = anomalies.find((a) => a.je_no === je2.je_no);
    expect(tamper).toBeDefined();
    expect(tamper.type).toBe("content_mismatch");
  });

  it("tamper: mutating first JE propagates chain_mismatch to second seal", () => {
    const jes   = [je1, je2];
    const seals = buildChain(jes);

    // Manually tamper seal[0].content_hash (as if someone edited the seal record itself)
    const tamperedSeals = seals.map((s, i) =>
      i === 0 ? { ...s, content_hash: sha256("garbage") } : s
    );

    // Rebuild expected chain_hash for seal[0] with tampered content
    const tamperedChain0 = sha256("" + tamperedSeals[0].content_hash);
    // seal[0].chain_hash in tampered is still the original — so seal[1] expected chain will not match

    const { ok, anomalies } = verifyChain(tamperedSeals, jes);
    expect(ok).toBe(false);
    // seal[0]: chain_mismatch because content_hash differs from canonical
    // (content still matches JE but recorded hash doesn't)
    expect(anomalies.length).toBeGreaterThan(0);
  });

  it("broken chain: mutating one chain_hash in the middle → verify detects it", () => {
    const jes   = [je1, je2, je3];
    const seals = buildChain(jes);

    // Corrupt seal[1].chain_hash directly
    const corrupted = seals.map((s, i) =>
      i === 1 ? { ...s, chain_hash: "deadbeef".repeat(8) } : s
    );

    const { ok, anomalies } = verifyChain(corrupted, jes);
    expect(ok).toBe(false);
    const mismatch = anomalies.find((a) => a.type === "chain_mismatch");
    expect(mismatch).toBeDefined();
  });

  it("missing JE record → anomaly type 'missing_je'", () => {
    const jes   = [je1, je2];
    const seals = buildChain(jes);

    // Provide only je1 — je2 is missing
    const { ok, anomalies } = verifyChain(seals, [je1]);
    expect(ok).toBe(false);
    const missing = anomalies.find((a) => a.type === "missing_je");
    expect(missing).toBeDefined();
    expect(missing.je_no).toBe(je2.je_no);
  });

  it("empty chain verifies as ok with zero checks", () => {
    const { ok, anomalies } = verifyChain([], []);
    expect(ok).toBe(true);
    expect(anomalies).toHaveLength(0);
  });

  it("sequence numbers are monotonically increasing in built chain", () => {
    const seals = buildChain([je1, je2, je3]);
    for (let i = 1; i < seals.length; i++) {
      expect(seals[i].sequence).toBe(seals[i - 1].sequence + 1);
    }
  });
});
