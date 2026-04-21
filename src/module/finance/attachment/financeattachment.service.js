import FinanceAttachmentModel, { FINANCE_SOURCE_TYPES, ATTACHMENT_CATEGORIES } from "./financeattachment.model.js";
import { s3Client, uploadFileToS3 } from "../../../../utils/awsBucket.js";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import logger from "../../../config/logger.js";

const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION;

// Upper-bound per-file size to keep hot S3 costs predictable.
// Frontend should also enforce — this is a server-side safety net.
const MAX_FILE_BYTES = 25 * 1024 * 1024;   // 25 MB

const ALLOWED_MIMES = [
  "application/pdf",
  "image/png", "image/jpeg", "image/jpg", "image/webp",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv", "text/plain",
  "application/zip",
];

function publicUrl(key) {
  if (!BUCKET || !REGION) return "";
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

class FinanceAttachmentService {
  // ── Upload one or more files to S3 + persist metadata ─────────────────
  // files: req.files[] from multer.array("files")
  // meta:  { source_type, source_ref, source_no, tender_id, category,
  //          description, tags, uploaded_by, uploaded_by_name }
  static async upload({ files, meta }) {
    if (!BUCKET) throw new Error("AWS_S3_BUCKET environment variable is not configured");
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("No files provided");
    }
    if (!meta?.source_type) throw new Error("source_type is required");
    if (!FINANCE_SOURCE_TYPES.includes(meta.source_type)) {
      throw new Error(`Invalid source_type '${meta.source_type}'. Allowed: ${FINANCE_SOURCE_TYPES.join(", ")}`);
    }
    if (!meta.source_ref && !meta.source_no) {
      throw new Error("source_ref or source_no is required");
    }
    if (meta.category && !ATTACHMENT_CATEGORIES.includes(meta.category)) {
      throw new Error(`Invalid category '${meta.category}'. Allowed: ${ATTACHMENT_CATEGORIES.join(", ")}`);
    }

    // Pre-validate every file BEFORE uploading any of them — partial
    // uploads would leave the user in an awkward retry-half state.
    for (const f of files) {
      if (!f.buffer || !f.originalname) {
        throw new Error("Invalid file payload (missing buffer or originalname)");
      }
      if (f.size > MAX_FILE_BYTES) {
        throw new Error(`File '${f.originalname}' exceeds ${MAX_FILE_BYTES / (1024 * 1024)} MB limit`);
      }
      if (f.mimetype && !ALLOWED_MIMES.includes(f.mimetype)) {
        throw new Error(`File '${f.originalname}' has unsupported MIME type '${f.mimetype}'`);
      }
    }

    const created = [];
    const tagsArr = Array.isArray(meta.tags)
      ? meta.tags
      : (typeof meta.tags === "string" && meta.tags ? meta.tags.split(",").map(s => s.trim()).filter(Boolean) : []);

    for (const file of files) {
      const uploadResult = await uploadFileToS3(file, BUCKET);
      const doc = await FinanceAttachmentModel.create({
        source_type: meta.source_type,
        source_ref:  meta.source_ref || null,
        source_no:   meta.source_no  || "",
        tender_id:   meta.tender_id  || "",
        filename:    file.originalname,
        s3_key:      uploadResult.Key,
        s3_bucket:   uploadResult.Bucket,
        file_url:    publicUrl(uploadResult.Key),
        mime_type:   file.mimetype || "",
        size_bytes:  file.size || 0,
        category:    meta.category || "Other",
        description: meta.description || "",
        tags:        tagsArr,
        uploaded_by: meta.uploaded_by || "",
        uploaded_by_name: meta.uploaded_by_name || "",
      });
      created.push(doc.toObject());
    }

    return { count: created.length, attachments: created };
  }

  // ── List attachments for a given source ────────────────────────────────
  // Either by ObjectId (source_ref) OR by document number (source_no).
  static async listForSource({ source_type, source_ref, source_no, include_deleted = false } = {}) {
    if (!source_type) throw new Error("source_type is required");

    const filter = { source_type };
    if (source_ref) filter.source_ref = source_ref;
    if (source_no)  filter.source_no  = source_no;
    if (!include_deleted) filter.is_deleted = { $ne: true };

    if (!source_ref && !source_no) {
      throw new Error("source_ref or source_no is required");
    }

    const rows = await FinanceAttachmentModel
      .find(filter)
      .sort({ uploaded_at: -1 })
      .lean();

    return rows;
  }

  static async list({ page = 1, limit = 50, source_type, tender_id, category, q, from_date, to_date } = {}) {
    const filter = { is_deleted: { $ne: true } };
    if (source_type) filter.source_type = source_type;
    if (tender_id)   filter.tender_id   = tender_id;
    if (category)    filter.category    = category;
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ filename: rx }, { source_no: rx }, { description: rx }];
    }
    if (from_date || to_date) {
      filter.uploaded_at = {};
      if (from_date) filter.uploaded_at.$gte = new Date(from_date);
      if (to_date)   filter.uploaded_at.$lte = new Date(to_date);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      FinanceAttachmentModel.find(filter).sort({ uploaded_at: -1 }).skip(skip).limit(Number(limit)).lean(),
      FinanceAttachmentModel.countDocuments(filter),
    ]);

    return { rows, total, page: Number(page), limit: Number(limit) };
  }

  static async getById(id) {
    const doc = await FinanceAttachmentModel.findById(id).lean();
    if (!doc) throw new Error("Attachment not found");
    return doc;
  }

  // ── Generate a 1-hour pre-signed download URL ─────────────────────────
  static async getDownloadUrl(id, { expires_seconds = 3600 } = {}) {
    const doc = await FinanceAttachmentModel.findById(id).lean();
    if (!doc) throw new Error("Attachment not found");
    if (doc.is_deleted) throw new Error("Attachment has been deleted");

    const command = new GetObjectCommand({
      Bucket: doc.s3_bucket,
      Key:    doc.s3_key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: Number(expires_seconds) || 3600 });

    return {
      attachment_id: String(doc._id),
      filename:      doc.filename,
      mime_type:     doc.mime_type,
      size_bytes:    doc.size_bytes,
      presigned_url: url,
      expires_in:    Number(expires_seconds) || 3600,
    };
  }

  // ── Soft delete (default) ──────────────────────────────────────────────
  // Audit trail compliance (Companies Act Rule 11(g)) requires we never
  // physically purge financial documents. The S3 object is also retained.
  // Pass hard_delete=true to actually remove from S3 — only allowed when
  // is_deleted is already true (admin cleanup workflow).
  static async deleteOne(id, { deleted_by = "", reason = "", hard_delete = false } = {}) {
    const doc = await FinanceAttachmentModel.findById(id);
    if (!doc) throw new Error("Attachment not found");

    if (hard_delete) {
      if (!doc.is_deleted) {
        throw new Error("Cannot hard-delete an active attachment. Soft-delete first.");
      }
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: doc.s3_bucket, Key: doc.s3_key }));
      } catch (err) {
        logger.error(`[FinanceAttachment] S3 delete failed for ${doc.s3_key}: ${err.message}`);
        // continue — DB record removal proceeds even if S3 delete failed
      }
      await FinanceAttachmentModel.deleteOne({ _id: doc._id });
      return { hard_deleted: true, _id: id };
    }

    if (doc.is_deleted) return { soft_deleted: true, already: true, _id: id };

    doc.is_deleted     = true;
    doc.deleted_by     = deleted_by || "";
    doc.deleted_at     = new Date();
    doc.deleted_reason = reason || "";
    await doc.save();

    return { soft_deleted: true, _id: id };
  }

  // ── Restore a soft-deleted attachment ──────────────────────────────────
  static async restore(id) {
    const doc = await FinanceAttachmentModel.findById(id);
    if (!doc) throw new Error("Attachment not found");
    if (!doc.is_deleted) return { restored: true, already: true, _id: id };

    doc.is_deleted = false;
    doc.deleted_by = "";
    doc.deleted_at = null;
    doc.deleted_reason = "";
    await doc.save();
    return { restored: true, _id: id };
  }

  // ── Update metadata only (cannot replace file) ────────────────────────
  static async updateMeta(id, payload) {
    const doc = await FinanceAttachmentModel.findById(id);
    if (!doc) throw new Error("Attachment not found");
    if (doc.is_deleted) throw new Error("Cannot edit a deleted attachment");

    const ALLOWED = ["category", "description", "tags"];
    for (const k of ALLOWED) {
      if (payload[k] !== undefined) {
        if (k === "category" && !ATTACHMENT_CATEGORIES.includes(payload[k])) {
          throw new Error(`Invalid category '${payload[k]}'`);
        }
        if (k === "tags") {
          doc.tags = Array.isArray(payload.tags)
            ? payload.tags
            : String(payload.tags || "").split(",").map(s => s.trim()).filter(Boolean);
        } else {
          doc[k] = payload[k];
        }
      }
    }
    await doc.save();
    return doc.toObject();
  }

  // ── Stats: attachment counts/size grouped by source_type ──────────────
  static async stats({ tender_id, from_date, to_date } = {}) {
    const match = { is_deleted: { $ne: true } };
    if (tender_id) match.tender_id = tender_id;
    if (from_date || to_date) {
      match.uploaded_at = {};
      if (from_date) match.uploaded_at.$gte = new Date(from_date);
      if (to_date)   match.uploaded_at.$lte = new Date(to_date);
    }

    const rows = await FinanceAttachmentModel.aggregate([
      { $match: match },
      { $group: {
          _id: "$source_type",
          file_count: { $sum: 1 },
          total_bytes: { $sum: "$size_bytes" },
        },
      },
      { $sort: { file_count: -1 } },
    ]);

    const totals = rows.reduce(
      (acc, r) => ({
        file_count:  acc.file_count + r.file_count,
        total_bytes: acc.total_bytes + r.total_bytes,
      }),
      { file_count: 0, total_bytes: 0 },
    );

    return {
      by_source: rows.map(r => ({
        source_type: r._id,
        file_count:  r.file_count,
        total_bytes: r.total_bytes,
        total_mb:    Math.round((r.total_bytes / (1024 * 1024)) * 100) / 100,
      })),
      totals: {
        file_count:  totals.file_count,
        total_bytes: totals.total_bytes,
        total_mb:    Math.round((totals.total_bytes / (1024 * 1024)) * 100) / 100,
      },
    };
  }
}

export default FinanceAttachmentService;
