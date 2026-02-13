
import TenderDocumentModel from "./tenderdocument.model.js";



class S3Service {

   static async getTenderDocumentByTenderId(tender_id) {
    return await TenderDocumentModel.findOne({ tender_id });
  }
}

export default S3Service;
