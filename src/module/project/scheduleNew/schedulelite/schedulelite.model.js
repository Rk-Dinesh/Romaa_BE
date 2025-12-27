import mongoose from "mongoose";
const { Schema } = mongoose;

// A. Generic Metrics
// Used at every level (Task, Month, Week) to track performance.
const MetricsSchema = new Schema(
  {
    achieved_quantity: { type: Number, default: 0 }, // Actual work done
    planned_quantity: { type: Number, default: 0 },  // Target work
    lag_quantity: { type: Number, default: 0 },      // Difference (Planned - Achieved)

    // Optional: Financials if needed later
    achieved_cost: { type: Number, default: 0 },
    planned_cost: { type: Number, default: 0 }
  },
  { _id: false } // No unique ID needed for simple sub-docs
);

// B. Daily Log Schema
// Stores raw, granular data. Perfect for "Daily Progress Reports".
const DailySchema = new Schema(
  {
    date: { type: Date, required: true },
    quantity: { type: Number, default: 0 },

    // Optional: Add metadata for the daily entry
    remarks: { type: String },
    status: { type: String, enum: ["working", "holiday", "delay"], default: "working" }
  },
  { _id: false }
);

// C. Weekly Schema (Child of Monthly)
const WeekDetailSchema = new Schema(
  {
    week_label: { type: String }, // e.g., "Week 1", "W42"
    week_number: { type: Number }, // 1-52
    start_date: { type: Date },
    end_date: { type: Date },

    // Metrics specific to this week
    metrics: { type: MetricsSchema, default: () => ({}) }
  },
  { _id: false }
);

// D. Monthly Schema (The 'Bucket' for Schedule Data)
const MonthlySchema = new Schema(
  {
    month_name: { type: String }, // e.g., "December"
    year: { type: Number },       // e.g., 2025
    month_key: { type: String },  // "12-2025" (Crucial for easy searching/filtering)

    // Metrics specific to this entire month
    metrics: { type: MetricsSchema, default: () => ({}) },

    // The weeks belonging to this month
    weeks: { type: [WeekDetailSchema], default: [] }
  },
  { _id: false }
);

const LeafReferenceSchema = new Schema({
  wbs_id: { type: String, required: true },
  row_index: { type: Number }
}, { _id: false });

// Hierarchy only stores IDs or basic info, not the full task data
const ScheduleLiteSchema = new Schema({
  tender_id: { type: String, required: true, unique: true },
  structure: [
    {
      group_name: String,
      group_id: String,
      row_index: { type: Number },
      items: [
        {
          item_name: String,
          work_group_id: String,
          row_index: { type: Number },
          unit: String,
          quantity: Number,
          executed_quantity: Number,
          balance_quantity: Number,
          start_date: Date,
          end_date: Date,
          revised_start_date: Date,
          revised_end_date: Date,
          duration: Number,
          revised_duration: Number,
          lag: Number,
          status: String,
          predecessor: String,
          successor: String,

          // A. Daily Logs: The raw history of every update.
          // Great for charts: "Show me progress over time"
          daily: { type: [DailySchema], default: [] },

          // B. Schedule Data: The structured plan.
          // Great for Gantt charts: "Show me monthly/weekly planned vs actual"
          schedule_data: { type: [MonthlySchema], default: [] },
          tasks: [
            {
              task_name: String,
              work_item_id: String,
              row_index: { type: Number },
              unit: String,
              quantity: Number,
              executed_quantity: Number,
              balance_quantity: Number,
              start_date: Date,
              end_date: Date,
              revised_start_date: Date,
              revised_end_date: Date,
              duration: Number,
              revised_duration: Number,
              lag: Number,
              status: String,
              predecessor: String,
              successor: String,

              // A. Daily Logs: The raw history of every update.
              // Great for charts: "Show me progress over time"
              daily: { type: [DailySchema], default: [] },

              // B. Schedule Data: The structured plan.
              // Great for Gantt charts: "Show me monthly/weekly planned vs actual"
              schedule_data: { type: [MonthlySchema], default: [] },
              task_wbs_ids: [LeafReferenceSchema]
            }
          ]
        }
      ]
    }
  ]
});
const ScheduleLiteModel = mongoose.model("Schedulelite", ScheduleLiteSchema);

export default ScheduleLiteModel;
