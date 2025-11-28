// models/MachineryAssetModel.js
import mongoose, { Schema } from "mongoose";

const MeterReadingHistorySchema = new mongoose.Schema(
  {
    readingDate: { type: Date, default: Date.now },
    meterStartReading: Number,
    meterEndReading: Number,
    tripCount: Number,
    fuelReading: Number,
    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
    operatorName: String,
    shift: String,
    remarks: String,
    location: String,
     //idleHours: Number,
   // productiveHours: Number,
    fuelFilled: Number,
    fuelCost: Number
  },
  { timestamps: true }
);

const TripDetailsSchema = new mongoose.Schema(
  {
    tripDate: { type: Date, default: Date.now },
    fromLocation: String,
    toLocation: String,
    materialType: String,
    quantity: Number,
    unit: String,
    tripTime: Number,
    driverName: String,
    vehicleNumber: String,
    remarks: String
  },
  { timestamps: true }
);

const MachineryAssetSchema = new mongoose.Schema(
  {
    // Basic Identification
    assetId: { type: String, required: true, unique: true },
    assetName: { type: String, required: true },
    assetType: {
      type: String,
      enum: [
        "Excavator", "JCB", "Bulldozer", "Crane", "Concrete Pump", 
        "Dumper", "Loader", "Compressor", "Generator", "Vibrator",
        "Road Roller", "Paver", "Batch Plant", "Transit Mixer", "Other"
      ],
      required: true
    },
    serialNumber: { type: String, required: true, unique: true },
    modelNumber: String,
    manufacturer: String,
    //yearOfManufacture: Number,

    // Project & Location
    projectId: { type: String, required: true },
    currentSite: {
      siteName: String,
      location: String,
      assignedDate: Date
    },

    // Technical Specifications
    capacity: String,
   // engineNumber: String,
   // engineHP: Number,
    fuelType: { type: String, enum: ["Diesel", "Electric", "Petrol", "CNG"], default: "Diesel" },
    fuelTankCapacity: Number,
  //  dimensions: {
    //  length: Number,
    //  width: Number,
      //height: Number,
     // weight: Number
   // },

    // Cost & Financials
    purchaseCost: Number,
    purchaseDate: Date,
   // supplier: String,
   // depreciationRate: Number,
   // currentBookValue: Number,
    insuranceDetails: {
      policyNumber: String,
      insurer: String,
      expiryDate: Date,
      premiumAmount: Number
    },

    // Operational Status
    currentStatus: {
      type: String,
      enum: ["Active", "Idle", "Maintenance", "Repair", "Offline", "Auctioned", "Sold", "Scrapped"],
      default: "Active"
    },
    availabilityStatus: {
      type: String,
      enum: ["Available", "Booked", "In Use"],
      default: "Available"
    },
    dailyRentalRate: Number,
   // hireChargesStartDate: Date,
   // hireChargesEndDate: Date,

    // Current Readings
    currentMeterReading: Number,
    currentTripCount: Number,
    currentFuelLevel: Number,
    lastMeterReadingDate: Date,

    // Meter & Trip History
    meterReadingHistory: [MeterReadingHistorySchema],
    tripHistory: [TripDetailsSchema],

    // Analytics
    // dailyFuelConsumption: Number,
    // monthlyFuelConsumption: Number,
    // fuelEfficiency: Number,
    // totalFuelConsumed: Number,
    // totalProductiveHours: Number,
    // totalIdleHours: Number,
    // utilizationPercentage: Number,

    // Assigned Personnel
    primaryOperator: {
      operatorId: { type: Schema.Types.ObjectId, ref: "User" },
      name: String,
      licenseExpiry: Date
    },
    helperCrew: [
      {
        crewId: { type: Schema.Types.ObjectId, ref: "User" },
        name: String,
        role: String
      }
    ],

    // Safety & Compliance
    safetyCertifications: [String],
    fitnessCertificateExpiry: Date,
    lastSafetyInspection: Date,
    nextSafetyInspection: Date,

    // Documents
    documents: [
      {
        documentType: String,
        fileUrl: String,
        uploadedDate: Date,
        expiryDate: Date
      }
    ],

    // GPS Tracking
    gpsInstalled: { type: Boolean, default: false },
    gpsDeviceId: String,
    gpsLastPing: Date,

    remarks: String,
    photos: [String]
  },
  { timestamps: true }
);

// Indexes
MachineryAssetSchema.index({ projectId: 1, currentStatus: 1 });
MachineryAssetSchema.index({ assetType: 1 });
MachineryAssetSchema.index({ serialNumber: 1 });
MachineryAssetSchema.index({ "meterReadingHistory.readingDate": -1 });
MachineryAssetSchema.index({ "tripHistory.tripDate": -1 });

const MachineryAssetModel = mongoose.model("MachineryAsset", MachineryAssetSchema);
export default MachineryAssetModel;

// {
//   "assetId": "ASSET-JCB001",
//   "assetName": "JCB Backhoe Loader 3DX Super",
//   "assetType": "JCB",
//   "serialNumber": "JCB3DXA123456789",
//   "modelNumber": "3DX Super",
//   "manufacturer": "JCB India Ltd",
//   "yearOfManufacture": 2024,
//   "projectId": "PROJ-2025-001",
//   "currentSite": {
//     "siteName": "Site A - Residential Tower",
//     "location": "Survey No. 45/2, Edappadi, Salem Dist, TN",
//     "assignedDate": "2025-11-01T00:00:00.000Z"
//   },
//   "capacity": "1.2 Cum Bucket / 0.28 Cum Backhoe",
//   "engineNumber": "ENG-JCB-456789",
//   "engineHP": 76,
//   "fuelType": "Diesel",
//   "fuelTankCapacity": 60,
//   "dimensions": {
//     "length": 5.42,
//     "width": 2.32,
//     "height": 2.62,
//     "weight": 6.1
//   },
//   "purchaseCost": 2850000,
//   "purchaseDate": "2024-03-15T00:00:00.000Z",
//   "supplier": "JCB Salem Dealers",
//   "depreciationRate": 15,
//   "currentBookValue": 2565000,
//   "insuranceDetails": {
//     "policyNumber": "INS-JCB-2025-001",
//     "insurer": "ICICI Lombard",
//     "expiryDate": "2026-03-14T00:00:00.000Z",
//     "premiumAmount": 85000
//   },
//   "currentStatus": "Active",
//   "availabilityStatus": "In Use",
//   "dailyRentalRate": 25000,
//   "hireChargesStartDate": "2025-11-01T00:00:00.000Z",
//   "currentMeterReading": 1452.5,
//   "currentFuelLevel": 45,
//   "lastMeterReadingDate": "2025-11-28T18:00:00.000Z",
//   "meterReadingHistory": [
//     {
//       "readingDate": "2025-11-28T18:00:00.000Z",
//       "meterReading": 1452.5,
//       "fuelReading": 45,
//       "recordedBy": "65a1b2c3d4e5f6789abcdef0",
//       "operatorName": "Ravi Kumar S",
//       "shift": "Day",
//       "remarks": "End of day reading",
//       "location": "Site A - Foundation Area",
//       "idleHours": 1.2,
//       "productiveHours": 8.5,
//       "fuelFilled": 25,
//       "fuelCost": 2500
//     },
//     {
//       "readingDate": "2025-11-27T18:00:00.000Z",
//       "meterReading": 1421.3,
//       "fuelReading": 32,
//       "recordedBy": "65a1b2c3d4e5f6789abcdef0",
//       "operatorName": "Ravi Kumar S",
//       "shift": "Day",
//       "productiveHours": 9.0,
//       "idleHours": 0.8
//     }
//   ],
//   "tripHistory": [],
//   "dailyFuelConsumption": 28.5,
//   "totalProductiveHours": 156.2,
//   "utilizationPercentage": 87.5,
//   "primaryOperator": {
//     "operatorId": "65a1b2c3d4e5f6789abcdef0",
//     "name": "Ravi Kumar S",
//     "licenseExpiry": "2026-03-20T00:00:00.000Z"
//   },
//   "helperCrew": [
//     {
//       "crewId": "65a1b2c3d4e5f6789abcdeff",
//       "name": "Mohan Kumar",
//       "role": "Helper"
//     }
//   ],
//   "safetyCertifications": ["RTO Fitness", "Pollution Under Control"],
//   "fitnessCertificateExpiry": "2026-06-15T00:00:00.000Z",
//   "nextSafetyInspection": "2026-01-15T00:00:00.000Z",
//   "documents": [
//     {
//       "documentType": "RC Book",
//       "fileUrl": "/assets/JCB001/rc-book.pdf",
//       "uploadedDate": "2025-11-01T00:00:00.000Z"
//     },
//     {
//       "documentType": "Insurance Policy",
//       "fileUrl": "/assets/JCB001/insurance.pdf",
//       "uploadedDate": "2025-11-01T00:00:00.000Z",
//       "expiryDate": "2026-03-14T00:00:00.000Z"
//     }
//   ],
//   "gpsInstalled": true,
//   "gpsDeviceId": "GPS-JCB-001",
//   "gpsLastPing": "2025-11-28T17:45:00.000Z",
//   "remarks": "Machine performing well. Regular maintenance schedule followed."
// }
