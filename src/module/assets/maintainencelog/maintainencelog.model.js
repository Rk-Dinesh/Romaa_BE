import mongoose, { Schema } from "mongoose";

const MaintenanceLogSchema = new mongoose.Schema(
    {
        assetId: { type: String, required: true, index: true, ref: 'MachineryAsset' },
        projectId: { type: String, required: true }, // To track which site incurred the cost
        date: { type: Date, default: Date.now },

        // Type of Expense (Matches your 'DETAILS' column)
        category: {
            type: String,
            enum: ["Scheduled Service", "Breakdown Repair", "Spare Parts", "Consumables", "Labor Charge", "Other"],
            required: true
        },

        // Detailed breakdown (Matches your 'ARIYALUR- HITACHI 220.csv' rows)
        description: { type: String, required: true }, // e.g., "Swing Bolt replacement", "Battery Charging"
        vendorName: String, // e.g., "Service Engineer Name"

        // Financials
        amount: { type: Number, required: true }, // The cost (e.g., 4000)
        invoiceNumber: String,

        // Audit
        meterReadingAtService: Number, // Useful to track service intervals (e.g., Service at 500 hours)
        remarks: String
    },
    { timestamps: true }
);

const MaintenanceLog = mongoose.model("MaintenanceLog", MaintenanceLogSchema);
export default MaintenanceLog;



// const TripSubSchema = new mongoose.Schema({
//   startTime: Date,
//   endTime: Date,
//   fromLocation: String,
//   toLocation: String,
//   materialCarried: String,
//   quantity: Number, // e.g., 20 Tons, 5 CuM
//   unit: String,
//   cycleCount: { type: Number, default: 1 }, // For repetitive tasks like Excavator bucket loads
//   remarks: String
// }, { _id: true }); // Keep IDs for specific trip tracking

// const MachineDailyLogSchema = new mongoose.Schema(
//   {
//     // --- Links ---
//     assetId: { type: String, required: true, index: true, ref: 'MachineryAsset' },
//     projectId: { type: String, required: true, index: true }, // Site ID
//     operatorId: { type: String, ref: "User" },
//     logDate: { type: Date, required: true, index: true }, // The day of operation

//     // --- Shift Details ---
//     shift: { type: String, enum: ["Day", "Night", "Double"], default: "Day" },
    
//     // --- Meter Tracking (The "Reading") ---
//     startReading: { type: Number, required: true }, // Start HMR/KMs
//     endReading: { type: Number, required: true },   // End HMR/KMs
//     netUsage: { type: Number }, // Calculated: End - Start (Hours or KMs)

//     // --- Time Analysis ---
//     machineStart: Date, // Actual time key-on
//     machineStop: Date,  // Actual time key-off
//     idleHours: { type: Number, default: 0 },
//     breakdownHours: { type: Number, default: 0 },
//     effectiveWorkingHours: { type: Number }, // (NetUsage - Idle)

//     // --- Fuel Tracking ---
//     fuelOpening: Number, // Liters in tank at start
//     fuelIssued: Number,  // Liters added today
//     fuelClosing: Number, // Liters in tank at end
//     fuelConsumed: { type: Number }, // Calculated: (Opening + Issued) - Closing

//     // --- Productivity (The "Trip Details" merged) ---
//     // If it's a Dumper, use trips. If it's a Crane, maybe just 1 "trip" describing the lift.
//     trips: [TripSubSchema],
    
//     // --- Aggregated Output ---
//     totalTrips: { type: Number, default: 0 },
//     totalMaterialMoved: { type: Number, default: 0 }, // Sum of trip quantities

//     // --- Validation ---
//     supervisorSignOff: { type: Schema.Types.ObjectId, ref: "User" },
//     remarks: String
//   },
//   { timestamps: true }
// );

// // Compound index for fast aggregation (Project Reports by Month)
// MachineDailyLogSchema.index({ projectId: 1, logDate: 1 });
// MachineDailyLogSchema.index({ assetId: 1, logDate: -1 }); // To find last log

// const MachineDailyLog = mongoose.model("MachineDailyLog", MachineDailyLogSchema);

