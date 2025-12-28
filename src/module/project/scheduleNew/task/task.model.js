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

const TaskSchema = new Schema(
  {
    // --- 1. Linking Fields (The "Flat" Hierarchy) ---
    // These allow you to filter tasks quickly without deep nesting.
    tender_id: { type: String, required: true, index: true },
    row_index: { type: Number }, 
    work_group_id: { type: String, index: true }, // e.g., ID for "Civil Works"
    work_item_id: { type: String, index: true },  // e.g., ID for "Foundation"
    work_task_id: { type: String, index: true },  // e.g., ID for "Foundation"
    wbs_id: { type: String, required: true, index: true }, // "WBS-001"

    // --- 2. Core Task Details ---
    description: { type: String, required: true },
    unit: { type: String }, // "m3", "sqft"
    
    // --- 3. High-Level Totals (Aggregates) ---
    // These allow you to show a summary list WITHOUT parsing the 'daily' array.
    quantity: { type: Number, required: true, default: 0 }, // Total Scope
    executed_quantity: { type: Number, default: 0 },        // Total Done
    balance_quantity: { type: Number, default: 0 },         // Remaining
    
    // --- 4. Timelines ---
    duration: { type: Number, default: 0 },
    revised_duration: { type: Number, default: 0 },
    
    start_date: { type: Date },
    end_date: { type: Date },
    
    revised_start_date: { type: Date },
    revised_end_date: { type: Date },
    lag: { type: Number, default: 0 },
    predecessor: String,
    predecessor_actual: String,
    successor: String,
    
    status: { 
      type: String, 
      enum: ["pending", "inprogress", "completed", "delayed"], 
      default: "pending" 
    },

    // --- 5. DETAILED DATA CONTAINERS ---
    
    // A. Daily Logs: The raw history of every update.
    // Great for charts: "Show me progress over time"
    daily: { type: [DailySchema], default: [] }, 

    // B. Schedule Data: The structured plan.
    // Great for Gantt charts: "Show me monthly/weekly planned vs actual"
    schedule_data: { type: [MonthlySchema], default: [] } 
  },
  { 
    timestamps: true, // Adds createdAt, updatedAt automatically
    minimize: false   // Ensures empty objects (like metrics) are saved
  }
);

// Create Compound Index for faster queries
// Example: "Find all tasks for Tender X inside Work Group Y"
TaskSchema.index({ tender_id: 1, work_group_id: 1 });

const TaskModel = mongoose.model("Task", TaskSchema);
export default TaskModel;

// {
//   "_id": "658f1b2c9d3e2a1b3c4d5e6f",
//   "tender_id": "TND-2025-001",
//   "work_group_id": "WG-CIVIL-01",
//   "work_item_id": "WI-FOUNDATION",
//   "wbs_id": "WBS-001",
  
//   "description": "Foundation Excavation Zone A",
//   "unit": "m3",
  
//   "quantity": 500,
//   "executed_quantity": 120,
//   "balance_quantity": 380,
  
//   "duration": 20,
//   "revised_duration": 22,
  
//   "start_date": "2025-12-01T00:00:00.000Z",
//   "end_date": "2025-12-20T00:00:00.000Z",
//   "revised_end_date": "2025-12-22T00:00:00.000Z",
  
//   "status": "inprogress",
  
//   "daily": [
//     {
//       "date": "2025-12-01T00:00:00.000Z",
//       "quantity": 10,
//       "status": "working"
//     },
//     {
//       "date": "2025-12-02T00:00:00.000Z",
//       "quantity": 15,
//       "status": "working"
//     },
//     {
//       "date": "2025-12-03T00:00:00.000Z",
//       "quantity": 0,
//       "status": "delay",
//       "remarks": "Heavy Rain"
//     }
//   ],

//   "schedule_data": [
//     {
//       "month_name": "December",
//       "year": 2025,
//       "month_key": "12-2025",
//       "metrics": {
//         "achieved_quantity": 120,
//         "planned_quantity": 150,
//         "lag_quantity": 30
//       },
//       "weeks": [
//         {
//           "week_label": "Week 1",
//           "week_number": 48,
//           "start_date": "2025-12-01T00:00:00.000Z",
//           "end_date": "2025-12-07T00:00:00.000Z",
//           "metrics": {
//             "achieved_quantity": 50,
//             "planned_quantity": 60,
//             "lag_quantity": 10
//           }
//         },
//         {
//           "week_label": "Week 2",
//           "week_number": 49,
//           "start_date": "2025-12-08T00:00:00.000Z",
//           "end_date": "2025-12-14T00:00:00.000Z",
//           "metrics": {
//             "achieved_quantity": 70,
//             "planned_quantity": 90,
//             "lag_quantity": 20
//           }
//         }
//       ]
//     }
//   ],
  
//   "createdAt": "2025-11-20T10:00:00.000Z",
//   "updatedAt": "2025-12-04T15:30:00.000Z"
// }