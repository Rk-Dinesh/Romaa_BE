import mongoose from "mongoose";

const GeofenceSchema = new mongoose.Schema({
  name: { type: String },         
  latitude: { type: Number },     
  longitude: { type: Number },    
  radiusMeters: { type: Number }, 
  isActive: { type: Boolean }
});

const Geofence = mongoose.model("Geofence", GeofenceSchema);
export default Geofence;