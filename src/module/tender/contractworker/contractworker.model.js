import mongoose from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

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

permittedcontractWorkerSchema.plugin(auditPlugin, { entity_type: "TenderContractWorker", entity_no_field: "tender_id" });

const PermiitedcontractWorkerModel = mongoose.model(
  "PermittedcontractWorker",
  permittedcontractWorkerSchema
);
export default PermiitedcontractWorkerModel;
