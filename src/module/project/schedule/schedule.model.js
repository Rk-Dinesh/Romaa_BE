import mongoose from "mongoose";

const { Schema } = mongoose;

// Daily quantity schema
const DailySchema = new Schema(
  {
    date: { type: Date },
    quantity: { type: Number, default: 0 },
  },
  { _id: false }
);

// Generic Metrics Schema
const MetricsSchema = new Schema(
  {
    achieved_quantity: { type: Number, default: 0 },
    planned_quantity: { type: Number, default: 0 },
    lag_quantity: { type: Number, default: 0 },
  },
  { _id: false }
);

// Weekly Schema
const WeekDetailSchema = new Schema(
  {
    week_label: { type: String }, // e.g., "firstweek", "secondweek" or "Week 1"
    week_number: { type: Number }, // 1, 2, 3, 4, 5
    start_date: { type: Date },    // Useful to know specific range of this week
    end_date: { type: Date },
    metrics: { type: MetricsSchema, default: {} }
  },
  { _id: false }
);

// Monthly Schema
const MonthlySchema = new Schema(
  {
    month_name: { type: String }, // e.g., "December"
    year: { type: Number },       // e.g., 2025
    month_key: { type: String },  // e.g., "12-2025" (for easy searching)
    metrics: { type: MetricsSchema, default: {} },
    // THE FIX: Weeks are now children of the Month
    weeks: { type: [WeekDetailSchema], default: [] } 
  },
  { _id: false }
);

// Item schema
const ItemSchema = new Schema(
  {
    wbs_id: { type: String, required: true, index: true },
    description: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true },
    // Aggregates
    executed_quantity: { type: Number, default: 0 },
    balance_quantity: { type: Number, default: 0 },   
    // Durations & Dates
    duration: { type: Number },
    revised_duration: { type: Number },
    start_date: { type: Date },
    end_date: { type: Date },
    revised_end_date: { type: Date },   
    lag: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "inprogress", "completed"], default: "pending" },   
    // Data Arrays
    daily: { type: [DailySchema], default: [] },
    // THE FIX: We only keep 'schedule_data' (monthly array) which holds the weeks inside
    schedule_data: { type: [MonthlySchema], default: [] }, 
  },
  { _id: false }
);

// Main schedule schema
const ScheduleSchema = new Schema(
  {
    tender_id: { type: String, required: true, unique: true, index: true },
    items: { type: [ItemSchema], default: [] },
  },
  { timestamps: true }
);

const ScheduleModel = mongoose.model("Schedule", ScheduleSchema);

export default ScheduleModel;