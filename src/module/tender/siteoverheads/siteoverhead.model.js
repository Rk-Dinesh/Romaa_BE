import mongoose from "mongoose";

const { Schema } = mongoose;

const ItemSchema = new Schema(
  {
    // Item-level info
    designation: { type: String, trim: true },          // for salary rows
    description: { type: String, trim: true },          // for expense rows

    nos: { type: Number, default: 0 },
    months: { type: Number, default: 0 },

    // numbers from JSON
    avg_salary_rs: { type: Number, default: 0 },        // for salary rows
    amount_rs: { type: Number, default: 0 },            // line total

    percentage_of_job_value: { type: Number, default: 0 } // only for risk line
  },
  { _id: false }
);

const SectionSchema = new Schema(
  {
    sno: { type: Number, required: true },              // 1..15
    title: { type: String, required: true, trim: true },

    items: { type: [ItemSchema], default: [] },

    subtotal_rs: { type: Number, default: 0 },
    subtotal_lakhs: { type: Number, default: 0 },
    total_nos: { type: Number, default: 0 },
    total_months: { type: Number, default: 0 }
  },
  { _id: false }
);

const SiteOverheadsSchema = new Schema(
  {
    // top‑level fields from sample JSON
    tenderId: { type: String, trim: true },
    tenderName: { type: String, trim: true },

    periodMonths: { type: Number, default: 0 },
    jobValueRs: { type: Number, default: 0 },

    // keep as string if you want commas exactly as provided
    grand_total_overheads_rs: { type: Number, default: 0 },

    sections: { type: [SectionSchema], default: [] }
  },
  { collection: "site_overheads", timestamps: true }
);

const SiteOverheads = mongoose.model("SiteOverheads", SiteOverheadsSchema);
export default SiteOverheads;
