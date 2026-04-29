import mongoose, { Schema } from "mongoose";

// SampleDataManifest — registers every document created during a sample-data
// seed run, by collection name + ObjectId. The wipe endpoint walks this list
// in reverse-dependency order so only sample rows are deleted; live data is
// untouched. Idempotent: at most one batch with a given batch_id can exist.

const SampleDataEntrySchema = new Schema(
  {
    collection_name: { type: String, required: true, index: true },
    doc_id:          { type: Schema.Types.ObjectId, required: true },
    business_id:     { type: String }, // human-readable ID for visibility
  },
  { _id: false }
);

const SampleDataManifestSchema = new mongoose.Schema(
  {
    batch_id:    { type: String, required: true, unique: true, index: true },
    description: String,
    seeded_at:   { type: Date, default: Date.now },
    seeded_by:   { type: Schema.Types.ObjectId, ref: "Employee" },
    counts:      { type: Schema.Types.Mixed, default: {} },
    entries:     { type: [SampleDataEntrySchema], default: [] },
  },
  { timestamps: true }
);

const SampleDataManifestModel = mongoose.model(
  "SampleDataManifest",
  SampleDataManifestSchema
);
export default SampleDataManifestModel;
