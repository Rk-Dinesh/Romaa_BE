import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true }, // Midnight UTC
    name: { type: String, required: true }, // e.g., "Republic Day"
    type: { 
      type: String, 
      enum: ["National", "Regional", "Optional", "Weekend"], 
      default: "National" 
    },
    description: { type: String },
    
    // Future-proofing: Applies to specific departments? (Empty = All)
    applicableDepartments: [{ type: String }] 
  },
  { timestamps: true }
);


const HolidayModel = mongoose.model("Holiday", holidaySchema);
export default HolidayModel;