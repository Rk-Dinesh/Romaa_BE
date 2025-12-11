import TenderModel from "./tender.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import ClientModel from "../../clients/client.model.js";
import DetailedEstimateModel from "../detailedestimate/detailedestimate.model.js";

class TenderService {
  // Create new tender
  static async createTender(tenderData) {
    const idname = "TENDER";
    const idcode = "TND";
    await IdcodeServices.addIdCode(idname, idcode);
    const tender_id = await IdcodeServices.generateCode(idname);

    const tender = new TenderModel({
      tender_id,
      ...tenderData,
      tender_project_name: "Tender No" + " " + tender_id,
    });

    const detailedEstimate = new DetailedEstimateModel({ tender_id });
        if (detailedEstimate.detailed_estimate.length === 0) {
      // If empty, push a new default object
      detailedEstimate.detailed_estimate.push({
        generalabstract: [],
        billofqty: []
      });
    }
    await detailedEstimate.save();

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

  static async getTenderByIdforApprove(tender_id) {
    return await TenderModel.findOne({ tender_id }).select(
      "tender_id tender_name tender_start_date tender_type tender_location tender_contact_person tender_contact_phone tender_contact_email client_name"
    );
  }

  static async getTenderByIdemd(tender_id) {
    return await TenderModel.findOne({ tender_id }).select(
      "emd.emd_percentage emd.emd_validity emd.emd_amount"
    );
  }

  // Update tender (with recalculations)
  static async updateTender(tender_id, updateData) {
    // if (updateData.tender_value && updateData.emd?.emd_percentage) {
    //   updateData.emd.emd_amount =
    //     (updateData.tender_value * updateData.emd.emd_percentage) / 100;
    // }

    // if (
    //   updateData.tender_value &&
    //   updateData.security_deposit?.security_deposit_percentage
    // ) {
    //   updateData.security_deposit.security_deposit_amount =
    //     (updateData.tender_value *
    //       updateData.security_deposit.security_deposit_percentage) /
    //     100;
    // }

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
        "tender_id tender_name tender_location tender_start_date tender_value tender_status tender_type client_id client_name tender_contact_person  tender_contact_phone tender_contact_email tender_duration tender_end_date tender_description emd.emd_percentage emd.emd_validity emd.emd_amount"
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
        tender_value: 1,
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
        tender_value: tender.tender_value,
        tender_name: tender.tender_name,
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
    };
  }

  static async addImportantDate(tender_id, dateData) {
    return await TenderModel.findOneAndUpdate(
      { tender_id },
      { $push: { follow_up_ids: dateData } },
      { new: true }
    );
  }

  static async updateTenderStatusWithWorkOrder(
    tender_id,
    workOrder_id,
    workOrder_issued_date
  ) {
    const tender = await TenderModel.findOne({ tender_id });

    if (!tender) {
      throw new Error("Tender not found for the given tender_id");
    }
    tender.workOrder_id = workOrder_id;
    tender.tender_status = "APPROVED";
    tender.workOrder_issued_date = workOrder_issued_date;

    await tender.save();

    return tender;
  }

  static async updateTenderStatusWithAgreement(
    tender_id,
    agreement_id,
    agreement_issued_date
  ) {
    const tender = await TenderModel.findOne({ tender_id });

    if (!tender) {
      throw new Error("Tender not found for the given tender_id");
    }
    tender.agreement_id = agreement_id;
    tender.tender_status = "APPROVED";
    tender.agreement_issued_date = agreement_issued_date;

    await tender.save();

    return tender;
  }

  static async getTendersPaginatedWorkorder(
    page,
    limit,
    search,
    fromdate,
    todate
  ) {
    const query = {};

    // ✅ Ensure workOrder_id is not empty
    query.workOrder_id = { $nin: [null, ""] };

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
        "tender_id tender_name tender_location tender_start_date tender_value tender_status tender_type client_id client_name tender_contact_person tender_contact_phone tender_contact_email tender_duration tender_end_date tender_description workOrder_id workOrder_issued_date emd.emd_percentage emd.emd_validity penalty_final_value tender_project_name"
      )
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return { total, tenders };
  }

  static async getTendersPaginatedEMDSD(page, limit, search, fromdate, todate) {
    const query = {};

    // ✅ Ensure workOrder_id is not empty
    query.workOrder_id = { $nin: [null, ""] };

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
        `
  tender_id
  tender_name
  workOrder_id
  workOrder_issued_date
  emd.emd_validity
  emd.emd_percentage
  emd.approved_emd_details.emd_proposed_company
  emd.approved_emd_details.emd_proposed_amount
  emd.approved_emd_details.emd_proposed_date
  emd.approved_emd_details.emd_approved
  emd.approved_emd_details.emd_approved_date
  emd.approved_emd_details.emd_approved_by
  emd.approved_emd_details.emd_approved_amount
  emd.approved_emd_details.emd_deposit_pendingAmount
  emd.approved_emd_details.emd_deposit_amount_collected
  emd.approved_emd_details.emd_approved_status
  emd.approved_emd_details.emd_applied_bank
  emd.approved_emd_details.emd_applied_bank_branch
  emd.approved_emd_details.emd_level
  emd.approved_emd_details.emd_note
  emd.approved_emd_details.security_deposit_amount
  emd.approved_emd_details.security_deposit_validity
  emd.approved_emd_details.security_deposit_status
  emd.approved_emd_details.security_deposit_approved_by
  emd.approved_emd_details.security_deposit_approved_date
  emd.approved_emd_details.security_deposit_amount_collected
  emd.approved_emd_details.security_deposit_pendingAmount
  emd.approved_emd_details.security_deposit_note
  `
      )
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return { total, tenders };
  }

  static async updateEmdDetailsService(tender_id, updates) {
    const { emd_note, emd_deposit_amount_collected } = updates;

    // Find the tender
    const tender = await TenderModel.findOne({ tender_id });

    if (!tender) throw new Error("Tender not found");

    // In your service function, add this check:
    if (
      !tender.emd.approved_emd_details ||
      tender.emd.approved_emd_details.length === 0
    ) {
      throw new Error("No approved EMD details found to update");
    }

    const emdEntry = tender.emd.approved_emd_details[0];
    console.log(emdEntry);

    // Update fields if provided
    if (emd_note !== undefined) emdEntry.emd_note = emd_note;
    if (emd_deposit_amount_collected !== undefined) {
      emdEntry.emd_deposit_amount_collected = emd_deposit_amount_collected;
    }

    // Auto-calculate pending amount
    emdEntry.emd_deposit_pendingAmount =
      emdEntry.emd_approved_amount - emdEntry.emd_deposit_amount_collected;

    // Save changes
    await tender.save();

    return emdEntry;
  }

  static async updateSDDetailsService(tender_id, updates) {
    const { security_deposit_note, security_deposit_amount_collected } =
      updates;

    // Find the tender
    const tender = await TenderModel.findOne({ tender_id });

    if (!tender) throw new Error("Tender not found");

    // In your service function, add this check:
    if (
      !tender.emd.approved_emd_details ||
      tender.emd.approved_emd_details.length === 0
    ) {
      throw new Error("No approved EMD details found to update");
    }

    const emdEntry = tender.emd.approved_emd_details[0];
    console.log(emdEntry);

    // Update fields if provided
    if (security_deposit_note !== undefined)
      emdEntry.security_deposit_note = security_deposit_note;
    if (security_deposit_amount_collected !== undefined) {
      emdEntry.security_deposit_amount_collected =
        security_deposit_amount_collected;
    }

    // Auto-calculate pending amount
    emdEntry.security_deposit_pendingAmount =
      emdEntry.security_deposit_amount -
      emdEntry.security_deposit_amount_collected;

    // Save changes
    await tender.save();

    return emdEntry;
  }

  static async getWorkorderForOverview(tender_id) {
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
        workOrder_id: 1,
        workOrder_issued_date: 1,
        tender_duration: 1,
        tender_value: 1,
        penalty_final_value: 1,
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
      workOrderDetails: {
        tender_id: tender.tender_id,
        tender_published_date: tender.tender_start_date,
        workOrder_id: tender.workOrder_id,
        workOrder_issued_date: tender.workOrder_issued_date,
        tender_name: tender.tender_name,
        client_name: tender.client_name,
        tender_type: tender.tender_type,
        tender_duration: tender.tender_duration,
        tender_value: tender.tender_value,
        project_location: tender.tender_location,
        contact_person: tender.tender_contact_person,
        contact_phone: tender.tender_contact_phone,
        contact_email: tender.tender_contact_email,
      },
    };
  }

  static async getTenderProcess(tender_id) {
    const tender = await TenderModel.findOne(
      { tender_id },
      { tender_process: 1 }
    );
    console.log(tender);

    if (!tender) throw new Error("Tender not found");
    return tender.tender_process;
  }

  // Update/save a single step data and mark completed
  static async saveTenderProcessStep(tender_id, stepData) {
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender not found");

    const index = tender.tender_process.findIndex(
      (s) => s.key === stepData.step_key
    );
    if (index === -1) throw new Error("Step not found");

    // Update step fields and mark completed
    tender.tender_process[index] = {
      ...tender.tender_process[index]._doc, // existing fields
      notes: stepData.notes || "",
      date: stepData.date || null,
      time: stepData.time || "",
      file_name: stepData.file_name || "",
      completed: true,
    };

    await tender.save();
    return tender.tender_process;
  }

  static async saveTenderProcessStepaws(tender_id, stepData) {
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender not found");

    const index = tender.tender_process.findIndex(
      (s) => s.key === stepData.step_key
    );
    if (index === -1) throw new Error("Step not found");

    tender.tender_process[index] = {
      ...tender.tender_process[index]._doc,
      notes: stepData.notes || "",
      date: stepData.date || null,
      time: stepData.time || "",
      file_name: stepData.file_name || "",
      file_url: stepData.file_url || "",
      completed: true,
    };

    await tender.save();
    return tender.tender_process;
  }

  static async getPreliminarySiteWork(tender_id) {
    const tender = await TenderModel.findOne(
      { tender_id },
      { preliminary_site_work: 1 }
    );
    if (!tender) throw new Error("Tender not found");
    return tender.preliminary_site_work;
  }

  static async savePreliminarySiteWork(tender_id, stepData) {
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender not found");

    const index = tender.preliminary_site_work.findIndex(
      (s) => s.key === stepData.step_key
    );
    if (index === -1) throw new Error("Step not found");

    tender.preliminary_site_work[index] = {
      ...tender.preliminary_site_work[index]._doc,
      notes: stepData.notes || "",
      date: stepData.date || null,
      time: stepData.time || "",
      file_name: stepData.file_name || "",
      file_url: stepData.file_url || "",
      completed: true,
    };

    await tender.save();
    return tender.preliminary_site_work;
  }

  static async savePreliminarySiteWorkaws(tender_id, stepData) {
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender not found");

    const index = tender.preliminary_site_work.findIndex(
      (s) => s.key === stepData.step_key
    );
    if (index === -1) throw new Error("Step not found");

    tender.preliminary_site_work[index] = {
      ...tender.preliminary_site_work[index]._doc,
      notes: stepData.notes || "",
      date: stepData.date || null,
      time: stepData.time || "",
      file_name: stepData.file_name || "",
      file_url: stepData.file_url || "",
      completed: true,
    };

    await tender.save();
    return tender.preliminary_site_work;
  }

  static async financialGeneralsUpdate(tender_id, workOrder_id, updateData) {
    return await TenderModel.findOneAndUpdate(
      { tender_id, workOrder_id },
      { $set: { financial_generals: updateData } },
      { new: true }
    );
  }

  static async getFinancialGenerals(tender_id, workOrder_id) {
    const tender = await TenderModel.findOne(
      { tender_id, workOrder_id },
      { financial_generals: 1 }
    );
    if (!tender) throw new Error("Tender not found");
    return tender.financial_generals;
  }

  static async getTenderPenalityValue() {
    return await TenderModel.find(
      {},
      {
        tender_id: 1,
        tender_name: 1,
        tender_value: 1,
        tender_type: 1,
        penalty_final_value: 1,
      }
    ).lean();
  }

  static async getGeneralSetup(tender_id) {
    const tender = await TenderModel.findOne(
      { tender_id },
      {
        tender_id: 1,
        tender_project_division: 1,
        tender_project_type: 1,
        tender_bussiness_type: 1,
        tender_project_name: 1,
      }
    );
    if (!tender) throw new Error("Tender not found");
    return tender;
  }

  static async updateGenerlSetup(tender_id, updateData) {
    return await TenderModel.findOneAndUpdate(
      { tender_id },
      { $set: updateData },
      { new: true }
    );
  }
}

export default TenderService;
