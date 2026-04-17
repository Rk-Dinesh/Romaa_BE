
import SiteDrawingModel from "./SiteDrawing.model.js";



class S3Service {

   static async getTenderDocumentByTenderId(tender_id) {
    return await SiteDrawingModel.findOne({ tender_id });
  }
}

export default S3Service;
