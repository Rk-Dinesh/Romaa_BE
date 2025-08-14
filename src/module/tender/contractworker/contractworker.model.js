import mongoose from "mongoose";

const contractWorkerSchema = new mongoose.Schema({
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

const contractWorkerModel = mongoose.model(
  "contractWorker",
  contractWorkerSchema
);
export default contractWorkerModel;
