import IdcodeServices from "../../idcode/idcode.service.js";
import TenderModel from "../tender/tender.model.js";
import PenaltyModel from "./penalities.model.js";



class PenaltyService {


static async addPenalty(penaltyData) {
  const idname = "PENALTY";
  const idcode = "PEN";
  await IdcodeServices.addIdCode(idname, idcode);
  const penalty_id = await IdcodeServices.generateCode(idname);
  if (!penalty_id) throw new Error("Failed to generate penalty ID");

  const penaltyDetails = penaltyData.listOfPenalties[0];

  let record = await PenaltyModel.findOne({ tender_id: penaltyData.tender_id });
  if (!record) {
    const newRecord = new PenaltyModel({
      tender_id: penaltyData.tender_id,
      listOfPenalties: [{ penalty_id, ...penaltyDetails }],
    });
    record = await newRecord.save();
  } else {
    record.listOfPenalties.push({ penalty_id, ...penaltyDetails });
    record = await record.save();
  }

  // Calculate sum of penalty_amount for all penalties related to this tender
  const totalPenalty = record.listOfPenalties.reduce(
    (acc, p) => acc + (p.penalty_amount || 0),
    0
  );

  // Update penalty_final_value in TenderModel
  await TenderModel.updateOne(
    { tender_id: penaltyData.tender_id },
    { $set: { penalty_final_value: totalPenalty } }
  );

  return record;
}



  /**
   * Get list of penalties by tender_id
   */
  static async getPenaltiesByTender(tender_id) {
    const record = await PenaltyModel.findOne({ tender_id });
    if (!record) return null;
    return { tender_id: record.tender_id, penalties: record.listOfPenalties };
    
  }

  /**
   * Update a penalty entry by penalty_id within a tender
   */
  static async updatePenalty(tender_id, penalty_id, updateData) {
    return await PenaltyModel.updateOne(
      { tender_id, "listOfPenalties.penalty_id": penalty_id },
      { $set: { "listOfPenalties.$": { penalty_id, ...updateData } } }
    );
  }

  /**
   * Remove a penalty by penalty_id from a tender
   */
  static async removePenalty(tender_id, penalty_id) {
    return await PenaltyModel.updateOne(
      { tender_id },
      { $pull: { listOfPenalties: { penalty_id } } }
    );
  }

  /**
   * Get paginated penalties for a tender with optional search
   */
  static async getPenaltiesPaginated(tender_id, page = 1, limit = 10, search = "") {
    const data = await PenaltyModel.findOne({ tender_id }, { listOfPenalties: 1, _id: 0 }).lean();

    if (!data || !data.listOfPenalties) {
      return { total: 0, penalties: [] };
    }

    let penalties = data.listOfPenalties;

    if (search) {
      const regex = new RegExp(search, "i");
      penalties = penalties.filter(
        p =>
          regex.test(p.penalty_id || "") ||
          regex.test(p.penalty_type || "") ||
          regex.test(p.description || "") ||
          regex.test(p.status || "")
      );
    }

    const total = penalties.length;
    const startIndex = (page - 1) * limit;
    const paginatedPenalties = penalties.slice(startIndex, startIndex + limit);

    return { total, penalties: paginatedPenalties };
  }
}

export default PenaltyService;
