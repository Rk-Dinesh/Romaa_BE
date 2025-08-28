import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  filename: { type: String, required: true },    // Name of the uploaded file
  file_url: { type: String, required: true },    // Path or URL to file storage
  type: { type: String, required: true },        // Type of document (e.g., PDF, DOCX)
  description: { type: String },                 // Short description (optional)
  uploaded_by: { type: String, required: true }, // User ID or name
  uploaded_at: { type: Date, default: Date.now },// Timestamp
  version: { type: Number, default: 1 },         // Version number
  is_active: { type: Boolean, default: true },   // Soft delete flag
});

// Main schema for tender documents management
const tenderDocumentSchema = new mongoose.Schema({
  tender_id: { type: String, required: true },        // Associated tender
  documents: [documentSchema],                        // Array of document objects
  updated_at: { type: Date, default: Date.now },      // Last modification timestamp
});

const TenderDocumentModel = mongoose.model("TenderDocument", tenderDocumentSchema);

export default TenderDocumentModel;
