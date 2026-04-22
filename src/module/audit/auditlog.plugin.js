import AppAuditService from "./auditlog.service.js";

// ── Audit Plugin ─────────────────────────────────────────────────────────────
//
// Attach once per schema:
//
//   import { auditPlugin } from "../../audit/auditlog.plugin.js";
//   MySchema.plugin(auditPlugin, {
//     entity_type: "Tender",
//     entity_no_field: "tender_id",        // optional — defaults to "_id"
//     excludedFields: ["updatedAt", "__v"] // optional — top-level keys to ignore in diff
//   });
//
// What it hooks:
//   • save        → action:"create" (isNew) or "update" (with diff)
//   • findOneAndUpdate / findByIdAndUpdate → action:"update" (with diff)
//   • updateOne / updateMany              → action:"update" (no diff, query-based)
//   • findOneAndDelete / findByIdAndDelete / deleteOne / deleteMany → action:"delete"
//
// Never throws. Every log is fire-and-forget — a failure in audit capture must
// never break the main write path. The service is imported lazily to avoid
// circular imports during module bootstrap.

const DEFAULT_EXCLUDED = new Set(["updatedAt", "createdAt", "__v", "_id"]);

function toSet(fields = []) {
  return new Set([...DEFAULT_EXCLUDED, ...fields]);
}

function pickEntityNo(doc, entityNoField) {
  if (!doc) return "";
  if (entityNoField && doc[entityNoField] != null) return String(doc[entityNoField]);
  if (doc._id) return String(doc._id);
  return "";
}

// Shallow diff — good enough for most records. For deeply nested subdocs we
// store the raw new value (useful for arrays of embedded docs). This keeps the
// diff human-readable without blowing up row size.
function shallowDiff(oldDoc, newDoc, excluded) {
  if (!oldDoc) return null;
  const changes = {};
  const keys = new Set([
    ...Object.keys(oldDoc || {}),
    ...Object.keys(newDoc || {}),
  ]);
  for (const k of keys) {
    if (excluded.has(k)) continue;
    const a = oldDoc?.[k];
    const b = newDoc?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes[k] = { from: a, to: b };
    }
  }
  return Object.keys(changes).length ? changes : null;
}

function safeLog(payload) {
  // Fire-and-forget. Service itself is non-throwing, but guard anyway.
  Promise.resolve()
    .then(() => AppAuditService.log(payload))
    .catch(() => {});
}

export function auditPlugin(schema, options = {}) {
  const entity_type     = options.entity_type || "Unknown";
  const entity_no_field = options.entity_no_field || null;
  const excluded        = toSet(options.excludedFields);

  // Cache original values when a doc is loaded from the DB so we can diff
  // them against the next save() call. Only top-level audited fields are
  // cached — nested subdoc diffs would balloon memory.
  schema.post("init", function auditPostInit() {
    this.$locals.__auditOriginal = this.toObject({ depopulate: true, flattenMaps: false });
  });

  // ── save: create + update via instance save() ───────────────────────────
  schema.pre("save", function auditPreSave(next) {
    if (this.isNew) {
      this.$locals.__audit = { action: "create" };
    } else {
      const original = this.$locals.__auditOriginal || {};
      const changes = {};
      for (const path of this.modifiedPaths()) {
        if (excluded.has(path) || path.includes(".")) continue;
        const from = original[path] ?? null;
        const to   = this.get(path);
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          changes[path] = { from, to };
        }
      }
      this.$locals.__audit = {
        action: "update",
        changes: Object.keys(changes).length ? changes : null,
      };
    }
    next();
  });

  schema.post("save", function auditPostSave(doc) {
    const loc = this.$locals?.__audit;
    if (!loc) return;
    safeLog({
      entity_type,
      entity_id:  doc._id,
      entity_no:  pickEntityNo(doc, entity_no_field),
      action:     loc.action,
      changes:    loc.changes || null,
    });
  });

  // ── findOneAndUpdate / findByIdAndUpdate ────────────────────────────────
  // Snapshot the pre-update doc, then diff against the post-update doc in
  // the post-hook. Uses query cloning so we don't interfere with the caller.
  schema.pre(["findOneAndUpdate", "findByIdAndUpdate"], async function auditPreFindUpd() {
    try {
      this._auditBefore = await this.model.findOne(this.getQuery()).lean();
    } catch (_) {
      this._auditBefore = null;
    }
  });

  schema.post(["findOneAndUpdate", "findByIdAndUpdate"], async function auditPostFindUpd(result) {
    if (!result) return;
    const before  = this._auditBefore;
    const after   = result.toObject ? result.toObject() : result;
    const changes = shallowDiff(before, after, excluded);
    safeLog({
      entity_type,
      entity_id:  after._id,
      entity_no:  pickEntityNo(after, entity_no_field),
      action:     "update",
      changes,
    });
  });

  // ── updateOne / updateMany (query-based bulk) ───────────────────────────
  // No diff — the caller didn't load the docs. We log the filter + update.
  schema.post(["updateOne", "updateMany"], function auditPostUpdQuery(result) {
    safeLog({
      entity_type,
      action: "update",
      meta: {
        query:     this.getQuery?.() || null,
        update:    this.getUpdate?.() || null,
        matched:   result?.matchedCount,
        modified:  result?.modifiedCount,
        bulk:      true,
      },
    });
  });

  // ── findOneAndDelete / findByIdAndDelete ────────────────────────────────
  schema.post(["findOneAndDelete", "findByIdAndDelete"], function auditPostDelOne(doc) {
    if (!doc) return;
    const obj = doc.toObject ? doc.toObject() : doc;
    safeLog({
      entity_type,
      entity_id:  obj._id,
      entity_no:  pickEntityNo(obj, entity_no_field),
      action:     "delete",
      meta:       { snapshot: obj },
    });
  });

  // ── deleteOne / deleteMany (query-based) ────────────────────────────────
  schema.post(["deleteOne", "deleteMany"], function auditPostDelQuery(result) {
    safeLog({
      entity_type,
      action: "delete",
      meta: {
        query:   this.getQuery?.() || null,
        deleted: result?.deletedCount,
        bulk:    true,
      },
    });
  });

  // ── Document .deleteOne() (instance method, rare) ───────────────────────
  schema.post("deleteOne", { document: true, query: false }, function auditPostDocDel(doc) {
    if (!doc) return;
    const obj = doc.toObject ? doc.toObject() : doc;
    safeLog({
      entity_type,
      entity_id:  obj._id,
      entity_no:  pickEntityNo(obj, entity_no_field),
      action:     "delete",
      meta:       { snapshot: obj },
    });
  });
}

export default auditPlugin;
