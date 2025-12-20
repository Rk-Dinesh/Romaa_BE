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

// Weekly metrics schema
const WeeklyMetricsSchema = new Schema(
  {
    achieved_quantity: { type: Number, default: 0 },
    planned_quantity: { type: Number, default: 0 },
    lag_quantity: { type: Number, default: 0 },
  },
  { _id: false }
);

// Weekly schema with all weeks
const WeeklySchema = new Schema(
  {
    firstweek: { type: WeeklyMetricsSchema, default: {} },
    secondweek: { type: WeeklyMetricsSchema, default: {} },
    thirdweek: { type: WeeklyMetricsSchema, default: {} },
    fourthweek: { type: WeeklyMetricsSchema, default: {} },
  },
  { _id: false }
);

// Monthly schema
const MonthlySchema = new Schema(
  {
    planned_quantity: { type: Number, default: 0 },
    achieved_quantity: { type: Number, default: 0 },
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
    executed_quantity: { type: Number, default: 0 },
    balance_quantity: { type: Number, default: 0 },
    duration: { type: Number },
    revised_duration: { type: Number },
    start_date: { type: Date },
    end_date: { type: Date },
    revised_end_date: { type: Date },
    lag: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "inprogress", "completed"], default: "pending" },
    daily: { type: [DailySchema], default: [] },
    weekly: { type: WeeklySchema, default: {} },
    monthly: { type: MonthlySchema, default: {} },
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