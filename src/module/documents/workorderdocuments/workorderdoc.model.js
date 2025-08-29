import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  filename: { type: String, required: true }, // Name of the uploaded file
  file_url: { type: String, required: true }, // Path or URL to file storage
  key: { type: String, required: true }, // S3 object key for retrieval
  type: { type: String, required: true }, // Type of document (e.g., PDF, DOCX)
  description: { type: String }, // Short description (optional)
  uploaded_by: { type: String, required: true }, // User ID or name
  uploaded_at: { type: Date, default: Date.now }, // Timestamp
  version: { type: Number, default: 1 }, // Version number
  is_active: { type: Boolean, default: true }, // Soft delete flag
});

// Main schema for tender documents management
const workOrderDocumentSchema = new mongoose.Schema({
  tender_id: { type: String, required: true }, // Associated tender
  workOrder_id: { type: String, required: true }, // Associated work order
  documents: [documentSchema], // Array of document objects
  updated_at: { type: Date, default: Date.now }, // Last modification timestamp
});

const WorkOrderDocumentModel = mongoose.model(
  "WorkOrderDocument",
  workOrderDocumentSchema
);

export default WorkOrderDocumentModel;
