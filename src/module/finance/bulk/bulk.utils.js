// ── Shared batch processing helper ───────────────────────────────────────────
export const processBatch = async (rows, handler, batchSize = 50) => {
  const results = { total: rows.length, success: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (row, idx) => {
        const rowNum = i + idx + 2; // +2: 1-based + header row
        try {
          await handler(row);
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push({ row: rowNum, message: err.message });
        }
      })
    );
  }
  return results;
};

// Parse a numeric cell safely
export const toNum = (val, fallback = 0) => {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
};

// Parse a date cell safely — returns ISO string or null
export const toDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// Normalize boolean cell ("yes"/"true"/"1" → true)
export const toBool = (val) =>
  ["yes", "true", "1", "y"].includes(String(val).toLowerCase().trim());

// Group flat rows by a key field (for bill headers + line items in same CSV)
export const groupRowsBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
};
