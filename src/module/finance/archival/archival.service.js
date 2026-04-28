import mongoose from "mongoose";
import ArchivalJobModel from "./archival.model.js";
import logger from "../../../config/logger.js";

// Models to archive (add more as needed)
import PurchaseBillModel from "../purchasebill/purchasebill.model.js";
import PaymentVoucherModel from "../paymentvoucher/paymentvoucher.model.js";
import ReceiptVoucherModel from "../receiptvoucher/receiptvoucher.model.js";
import JournalEntryModel from "../journalentry/journalentry.model.js";
import ExpenseVoucherModel from "../expensevoucher/expensevoucher.model.js";
import CreditNoteModel from "../creditnote/creditnote.model.js";
import DebitNoteModel from "../debitnote/debitnote.model.js";

const ARCHIVE_MODELS = [
  { name: "PurchaseBill",   model: PurchaseBillModel,   fyField: "fin_year"       },
  { name: "PaymentVoucher", model: PaymentVoucherModel, fyField: "document_year"  },
  { name: "ReceiptVoucher", model: ReceiptVoucherModel, fyField: "document_year"  },
  { name: "JournalEntry",   model: JournalEntryModel,   fyField: "financial_year" },
  { name: "ExpenseVoucher", model: ExpenseVoucherModel, fyField: "document_year"  },
  { name: "CreditNote",     model: CreditNoteModel,     fyField: "document_year"  },
  { name: "DebitNote",      model: DebitNoteModel,      fyField: "document_year"  },
];

const BATCH_SIZE = 200;

export default class ArchivalService {

  // Archive a given FY — copies all approved/cancelled docs to archive
  // collections, marks originals as archived. Returns immediately (async job).
  static async archiveFY(fin_year, initiated_by) {
    // Prevent duplicate archival
    const existing = await ArchivalJobModel.findOne({ fin_year });
    if (existing?.status === "completed") {
      throw new Error(`FY ${fin_year} has already been archived.`);
    }
    if (existing?.status === "running") {
      throw new Error(`Archival for FY ${fin_year} is already in progress.`);
    }

    const job = await ArchivalJobModel.findOneAndUpdate(
      { fin_year },
      { status: "running", started_at: new Date(), initiated_by, error: "" },
      { upsert: true, new: true }
    );

    // Run async — don't block the HTTP response
    setImmediate(() =>
      ArchivalService._runArchival(job._id, fin_year).catch((err) =>
        logger.error({ context: "ArchivalService._runArchival", fin_year, message: err.message })
      )
    );

    return { message: `Archival for FY ${fin_year} has been started.`, job_id: job._id };
  }

  static async _runArchival(jobId, fin_year) {
    const archivedCollections = [];
    let totalRecords = 0;

    try {
      for (const { name, model, fyField } of ARCHIVE_MODELS) {
        const archiveCollName = `${model.collection.name}_archive`;

        // Dynamically create or reuse archive model on the archive collection
        const ArchiveModel =
          mongoose.models[`${name}Archive`] ||
          mongoose.model(`${name}Archive`, model.schema, archiveCollName);

        let count  = 0;
        let lastId = null;

        while (true) {
          const q = {
            [fyField]: fin_year,
            status: { $in: ["approved", "cancelled"] },
          };
          if (lastId) q._id = { $gt: lastId };

          const docs = await model
            .find(q)
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .lean();

          if (!docs.length) break;

          // Copy to archive collection (ignore duplicate key errors)
          await ArchiveModel.insertMany(docs, { ordered: false }).catch(() => {});

          // Mark originals as archived
          const ids = docs.map((d) => d._id);
          await model.updateMany({ _id: { $in: ids } }, { $set: { is_archived: true } });

          count  += docs.length;
          lastId  = docs[docs.length - 1]._id;
          if (docs.length < BATCH_SIZE) break;
        }

        archivedCollections.push({ collection_name: name, count });
        totalRecords += count;
        logger.info({ context: "ArchivalService", fin_year, collection: name, count });
      }

      await ArchivalJobModel.findByIdAndUpdate(jobId, {
        status:               "completed",
        completed_at:         new Date(),
        total_records:        totalRecords,
        archived_collections: archivedCollections,
      });

      logger.info({
        context:      "ArchivalService",
        message:      "Archival complete",
        fin_year,
        totalRecords,
      });
    } catch (err) {
      await ArchivalJobModel.findByIdAndUpdate(jobId, {
        status: "failed",
        error:  err.message,
      });
      throw err;
    }
  }

  static async getJobStatus(fin_year) {
    return ArchivalJobModel.findOne({ fin_year }).lean();
  }

  static async listJobs() {
    return ArchivalJobModel.find().sort({ createdAt: -1 }).lean();
  }
}
