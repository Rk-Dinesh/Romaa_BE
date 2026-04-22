import mongoose from "mongoose";
import logger from "../../config/logger.js";
import AppAuditLogModel from "./auditlog.model.js";

// ── Audit Retention / Archival ──────────────────────────────────────────────
//
// Moves rows older than `retention_days` out of the hot collection into a
// sibling `_archive` collection. Archived rows remain queryable (same shape)
// but are no longer returned by the default API — keeps indexes and working
// set small while preserving full history for audits.
//
// Runs daily via cron. Safe to invoke manually: POST /audit/retention/run.

const DEFAULT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS) || 90;
const DEFAULT_BATCH_SIZE     = Number(process.env.AUDIT_ARCHIVE_BATCH) || 1000;

// Lazily-created archive models keyed by source collection name.
const archiveModelCache = new Map();

function getArchiveModel(sourceCollectionName) {
  if (archiveModelCache.has(sourceCollectionName)) {
    return archiveModelCache.get(sourceCollectionName);
  }
  const archiveColl = `${sourceCollectionName}_archive`;
  const modelName   = archiveColl.split("_").map((s) => s[0]?.toUpperCase() + s.slice(1)).join("");
  const schema      = new mongoose.Schema({}, { strict: false, collection: archiveColl });
  // Minimal indexes — mirror the hot collection's core lookup paths.
  schema.index({ entity_type: 1, entity_id: 1, createdAt: -1 });
  schema.index({ actor_id: 1, createdAt: -1 });
  schema.index({ createdAt: -1 });
  const model =
    mongoose.models[modelName] || mongoose.model(modelName, schema, archiveColl);
  archiveModelCache.set(sourceCollectionName, model);
  return model;
}

async function archiveCollection({ sourceModel, sourceName, retention_days = DEFAULT_RETENTION_DAYS, batch_size = DEFAULT_BATCH_SIZE }) {
  const cutoff = new Date(Date.now() - retention_days * 24 * 60 * 60 * 1000);
  const Archive = getArchiveModel(sourceName);

  let total_archived = 0;
  let total_failed   = 0;

  // Loop in batches until no rows older than cutoff remain.
  // Copy-then-delete is safer than a single transactional move: even if the
  // worker crashes mid-batch, the hot collection still has the rows and the
  // next run picks up where it left off (idempotent on _id).
  /* eslint-disable no-await-in-loop */
  while (true) {
    const batch = await sourceModel
      .find({ createdAt: { $lt: cutoff } })
      .sort({ createdAt: 1 })
      .limit(batch_size)
      .lean();

    if (batch.length === 0) break;

    try {
      await Archive.insertMany(batch, { ordered: false });
    } catch (err) {
      // Duplicate key errors mean some rows already archived — fine. Other
      // errors we log and stop to avoid data loss.
      if (err.code !== 11000 && !err.writeErrors?.every((e) => e.code === 11000)) {
        logger.error({ context: "audit.archive.insert", collection: sourceName, message: err.message });
        total_failed += batch.length;
        break;
      }
    }

    const ids = batch.map((r) => r._id);
    const delResult = await sourceModel.deleteMany({ _id: { $in: ids } });
    total_archived += delResult.deletedCount || 0;

    if (batch.length < batch_size) break; // last partial batch
  }
  /* eslint-enable no-await-in-loop */

  return { collection: sourceName, cutoff: cutoff.toISOString(), archived: total_archived, failed: total_failed };
}

// ── Public: archive the app audit log ──────────────────────────────────────
export async function runAppAuditArchive({ retention_days = DEFAULT_RETENTION_DAYS } = {}) {
  try {
    return await archiveCollection({
      sourceModel: AppAuditLogModel,
      sourceName:  AppAuditLogModel.collection.collectionName,
      retention_days,
    });
  } catch (err) {
    logger.error({ context: "audit.archive.app", message: err.message });
    return { collection: "app_audit_logs", archived: 0, failed: 0, error: err.message };
  }
}

// ── Public: archive the finance audit log ──────────────────────────────────
// Kept here (not in finance/archival) because this is time-based retention,
// whereas finance/archival is FY-based voucher archival — different semantics.
export async function runFinanceAuditArchive({ retention_days = DEFAULT_RETENTION_DAYS } = {}) {
  try {
    const { default: FinanceAuditLogModel } = await import("../finance/audit/auditlog.model.js");
    return await archiveCollection({
      sourceModel: FinanceAuditLogModel,
      sourceName:  FinanceAuditLogModel.collection.collectionName,
      retention_days,
    });
  } catch (err) {
    logger.error({ context: "audit.archive.finance", message: err.message });
    return { collection: "finance_audit_logs", archived: 0, failed: 0, error: err.message };
  }
}

// Run both in one go (used by the cron).
export async function runAllAuditArchives({ retention_days } = {}) {
  const [app, finance] = await Promise.all([
    runAppAuditArchive({ retention_days }),
    runFinanceAuditArchive({ retention_days }),
  ]);
  logger.info({
    context: "audit.archive.summary",
    app_archived:     app.archived,
    finance_archived: finance.archived,
    cutoff_days:      retention_days || DEFAULT_RETENTION_DAYS,
  });
  return { app, finance };
}
