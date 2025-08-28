import mongoose from "mongoose";

const permittedcontractWorkerSchema = new mongoose.Schema({
  tender_id: String,
  listOfContractWorkers: [
    {
      contractWorker_id: String,
      contractWorker_name:String,
      contractStart_date: Date,
      contractEnd_date: Date,
      contratctSite: String,
      contractStatus: String,
    },
  ],
});

const PermiitedcontractWorkerModel = mongoose.model(
  "PermittedcontractWorker",
  permittedcontractWorkerSchema
);
export default PermiitedcontractWorkerModel;
