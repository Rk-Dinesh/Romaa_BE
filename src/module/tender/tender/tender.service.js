import TenderModel from "./tender.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import ClientModel from "../../clients/client.model.js";

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

  static async getTendersPaginated(page, limit, search, fromdate, todate) {
    const query = {};

    // 🔍 Keyword Search
    if (search) {
      query.$or = [
        { tender_name: { $regex: search, $options: "i" } },
        { tender_id: { $regex: search, $options: "i" } },
        { "tender_location.city": { $regex: search, $options: "i" } },
        { "tender_location.state": { $regex: search, $options: "i" } },
        { "tender_location.country": { $regex: search, $options: "i" } },
      ];
    }

    // 📅 Date Filtering (based on tender_start_date)
    if (fromdate || todate) {
      query.tender_start_date = {};
      if (fromdate) query.tender_start_date.$gte = new Date(fromdate);
      if (todate) {
        const endOfDay = new Date(todate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        query.tender_start_date.$lte = endOfDay;
      }
    }

    const total = await TenderModel.countDocuments(query);

    const tenders = await TenderModel.find(query)
      .select(
        "tender_id tender_name tender_location tender_start_date tender_value tender_status tender_type client_id client_name tender_contact_person  tender_contact_phone tender_contact_email tender_duration tender_end_date tender_description emd.emd_percentage emd.emd_validity"
      ) // ✅ only required fields
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return { total, tenders };
  }
  static async getTenderForOverview(tender_id) {
    const tender = await TenderModel.findOne(
      { tender_id },
      {
        tender_id: 1,
        tender_name: 1,
        tender_start_date: 1,
        tender_type: 1,
        tender_location: 1,
        tender_contact_person: 1,
        tender_contact_phone: 1,
        tender_contact_email: 1,
        tender_status_check: 1,
        follow_up_ids: 1,
        client_id: 1,
        client_name: 1,
      }
    ).lean();

    if (!tender) return null;

    // Minimal client lookup
    const client = await ClientModel.findOne(
      { client_id: tender.client_id },
      {
        client_id: 1,
        client_name: 1,
        contact_phone: 1,
        contact_email: 1,
        address: 1,
        pan_no: 1,
        cin_no: 1,
        gstin: 1,
      }
    ).lean();

    return {
      tenderDetails: {
        tender_id: tender.tender_id,
        tender_published_date: tender.tender_start_date,
        tender_type: tender.tender_type,
        project_location: tender.tender_location,
        contact_person: tender.tender_contact_person,
        contact_phone: tender.tender_contact_phone,
        contact_email: tender.tender_contact_email,
      },
      customerDetails: client
        ? {
            client_id: client.client_id,
            client_name: client.client_name,
            contact_phone: client.contact_phone,
            contact_email: client.contact_email,
            address: client.address,
            pan_no: client.pan_no,
            cin_no: client.cin_no,
            gstin: client.gstin,
          }
        : null,
      importantDates: (tender.follow_up_ids || []).map((fu) => ({
      title: fu.title,
      date: fu.date,
      time: fu.time,
      address: fu.address || "",
      notes: fu.notes || ""
    })),
      tenderProcess: tender.tender_status_check || {},
    };
  }

  static async addImportantDate(tender_id, dateData) {
    return await TenderModel.findOneAndUpdate(
      { tender_id },
      { $push: { follow_up_ids: dateData } },
      { new: true }
    );
  }
}

export default TenderService;
