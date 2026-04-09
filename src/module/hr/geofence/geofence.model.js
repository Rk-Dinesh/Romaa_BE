import mongoose from "mongoose";

const GeofenceSchema = new mongoose.Schema(
  {
    name:          { type: String, required: true, trim: true },
    latitude:      { type: Number, required: true },
    longitude:     { type: Number, required: true },
    radiusMeters:  { type: Number, required: true, min: 10, max: 5000, default: 1000 },
    isActive:      { type: Boolean, default: true, index: true },

    // Optional: link to a specific tender/project site
    tenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenders",
      default: null,
    },

    description: { type: String },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
  },
  { timestamps: true }
);

GeofenceSchema.index({ tenderId: 1 });

const Geofence = mongoose.model("Geofence", GeofenceSchema);
export default Geofence;
