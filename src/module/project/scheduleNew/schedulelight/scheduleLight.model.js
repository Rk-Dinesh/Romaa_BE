import mongoose from "mongoose";
const { Schema } = mongoose;

// Hierarchy only stores IDs or basic info, not the full task data
const ScheduleLightSchema = new Schema({
  tender_id: { type: String, required: true, unique: true },
  structure: [
    {
      group_name: String,
      items: [
        {
          item_name: String,
          unit: String,
          quantity: Number,
          start_date: Date,
          end_date: Date,
          revised_start_date: Date,
          revised_end_date: Date,
          duration: Number,
          revised_duration: Number,
          status: String,
          tasks: [
            {
              task_name: String,
              unit: String,
              quantity: Number,
              task_wbs_ids: [{ type: String }] 
            }
          ]
        }
      ]
    }
  ]
});
const ScheduleLightModel = mongoose.model("Schedulelight", ScheduleLightSchema);

export default ScheduleLightModel;
