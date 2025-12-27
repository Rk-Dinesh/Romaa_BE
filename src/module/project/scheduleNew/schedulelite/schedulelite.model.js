import mongoose from "mongoose";
const { Schema } = mongoose;

// Hierarchy only stores IDs or basic info, not the full task data
const ScheduleLiteSchema = new Schema({
  tender_id: { type: String, required: true, unique: true },
  structure: [
    {
      group_name: String,
      row_index: { type: Number },    
      items: [
        {
          item_name: String,
          row_index: { type: Number },
          unit: String,
          quantity: Number,
          start_date: Date,
          end_date: Date,
          revised_start_date: Date,
          revised_end_date: Date,
          duration: Number,
          revised_duration: Number,
          lag: Number,
          status: String,
          tasks: [
            {
              task_name: String,
              row_index: { type: Number },
              unit: String,
              quantity: Number,
              start_date: Date,
              end_date: Date,
              revised_start_date: Date,
              revised_end_date: Date,
              duration: Number,
              revised_duration: Number,
              lag: Number,
              status: String,
              task_wbs_ids: [{ type: String }] 
            }
          ]
        }
      ]
    }
  ]
});
const ScheduleLiteModel = mongoose.model("Schedulelite", ScheduleLiteSchema);

export default ScheduleLiteModel;
