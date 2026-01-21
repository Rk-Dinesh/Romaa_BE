import mongoose from "mongoose";

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