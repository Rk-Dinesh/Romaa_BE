import mongoose, { Schema } from "mongoose";

const MachineryAssetSchema = new mongoose.Schema(
  {
    // --- 1. Basic Identity ---
    assetId: { type: String, required: true, unique: true, index: true }, // e.g., "EX-01"
    assetName: { type: String, required: true }, // e.g., "Hitachi Zaxis 220"
    assetCategory: {
      type: String,
      enum: ["Heavy Earthmover", "Transport Vehicle", "Stationary Equipment", "Lifting"],
      required: true
    },
    assetType: { type: String,
       enum: ["OWN ASSET", "RENTAL ASSET"],
       required: true }, 
    
    // --- 2. Technical Specifications (Expanded) ---
    serialNumber: String,      // OEM Serial No
    modelNumber: String,       // e.g., "Zaxis 220 LC"
    chassisNumber: String,     // CRITICAL: Unique ID for RTO/Insurance
    engineNumber: String,      // CRITICAL: For maintenance tracking
    manufacturingYear: Number, // e.g., 2024
    fuelType: { type: String, enum: ["Diesel", "Petrol", "Electric"], default: "Diesel" },
    fuelTankCapacity: Number,  // Liters (Helps validate fuel fill-up logs)

    // --- 3. Tracking Configuration ---
    trackingMode: {
      type: String,
      enum: ["HOURS", "KILOMETERS", "UNITS"], 
      default: "HOURS"
    },
    
    // --- 4. GPS & Telematics (New) ---
    gps: {
      isInstalled: { type: Boolean, default: false },
      deviceId: String,        // IMEI or Device ID
      provider: String,        // e.g., "Trimble", "TrackEasy"
      lastPingDate: Date,      // Last known connectivity
      lastKnownLocation: {     // GeoJSON or simple coords
        lat: Number,
        lng: Number,
        address: String
      }
    },

    // --- 5. Current Operational Snapshot ---
    currentSite: { type: String, index: true }, // e.g., "ARIYALUR"
    projectId: { type: String, index: true }, 
    currentStatus: { 
      type: String, 
      enum: ["Active", "Idle", "Maintenance", "Breakdown", "Scrapped"], 
      default: "Active" 
    },
    lastReading: { type: Number, default: 0 }, // Last HMR/KMs recorded
    lastReadingDate: { type: Date },
    totalFuelConsumed: { type: Number, default: 0 },

    // --- 6. Compliance & Certificates (Critical for Alerts) ---
    // Storing dates here allows easy queries like: "Find assets with Insurance expiring in 30 days"
    compliance: {
      insurancePolicyNo: String,
      insuranceExpiry: Date,
      fitnessCertExpiry: Date,  // FC
      pollutionCertExpiry: Date,// PUC
      roadTaxExpiry: Date,
      permitExpiry: Date
    },

    // --- 7. Documents (Digital Storage) ---
    documents: [{ 
        docType: { type: String, enum: ["Insurance", "RC", "Invoice", "Fitness", "Other"] },
        docNumber: String,
        expiryDate: Date, 
        fileUrl: String, // S3/Cloud Link
        uploadedAt: { type: Date, default: Date.now }
    }],

    // --- 8. Financials ---
    purchaseDate: Date,
    purchaseCost: Number,
    supplierName: String,
    invoiceNumber: String
  },
  { timestamps: true }
);

// Index for expiry alerts
MachineryAssetSchema.index({ "compliance.insuranceExpiry": 1 });
MachineryAssetSchema.index({ "compliance.fitnessCertExpiry": 1 });

 const MachineryAsset = mongoose.model("MachineryAsset", MachineryAssetSchema);
 export default MachineryAsset;