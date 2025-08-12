import TenderModel from "./tender.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

class TenderService {
  // Create new tender
  static async createTender(tenderData) {
    const idname = "TENDER";
    const idcode = "TND";
    await IdcodeServices.addIdCode(idname, idcode);
    const tender_id = await IdcodeServices.generateCode(idname);

    // Auto calculations
    if (tenderData.tender_value && tenderData.emd?.emd_percentage) {
      tenderData.emd.emd_amount =
        (tenderData.tender_value * tenderData.emd.emd_percentage) / 100;
    }

    if (
      tenderData.tender_value &&
      tenderData.security_deposit?.security_deposit_percentage
    ) {
      tenderData.security_deposit.security_deposit_amount =
        (tenderData.tender_value *
          tenderData.security_deposit.security_deposit_percentage) /
        100;
    }

    const tender = new TenderModel({
      tender_id,
      ...tenderData,
    });
    return await tender.save();
  }

  // Get all tenders
  static async getAllTenders() {
    return await TenderModel.find();
  }

  // Get tender by ID
  static async getTenderById(tender_id) {
    return await TenderModel.findOne({ tender_id });
  }

  // Update tender (with recalculations)
  static async updateTender(tender_id, updateData) {
    if (updateData.tender_value && updateData.emd?.emd_percentage) {
      updateData.emd.emd_amount =
        (updateData.tender_value * updateData.emd.emd_percentage) / 100;
    }

    if (
      updateData.tender_value &&
      updateData.security_deposit?.security_deposit_percentage
    ) {
      updateData.security_deposit.security_deposit_amount =
        (updateData.tender_value *
          updateData.security_deposit.security_deposit_percentage) /
        100;
    }

    return await TenderModel.findOneAndUpdate(
      { tender_id },
      { $set: updateData },
      { new: true }
    );
  }

  // Delete tender
  static async deleteTender(tender_id) {
    return await TenderModel.findOneAndDelete({ tender_id });
  }

  // Special update for tender_status_check
  static async updateTenderStatusCheck(tender_id, statusData) {
    return await TenderModel.findOneAndUpdate(
      { tender_id },
      { $set: { tender_status_check: statusData } },
      { new: true }
    );
  }
}

export default TenderService;
