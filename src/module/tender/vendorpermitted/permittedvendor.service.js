import VendorPermittedModel from "./vendorpermitted.mode.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import TenderModel from "../tender/tender.model.js";

class VendorPermittedService {
  /**
   * Add permitted vendors to a tender AND update TenderModel.vendor_details
   */
  static async addPermittedVendors(tender_id, vendors) {
    let record = await VendorPermittedModel.findOne({ tender_id });

    if (!record) {
      record = new VendorPermittedModel({
        tender_id,
        listOfPermittedVendors: vendors
      });
    } else {
      record.listOfPermittedVendors.push(...vendors);
    }

    const savedRecord = await record.save();

    // Push vendor IDs into TenderModel.vendor_details (avoid duplicates)
    const vendorIds = vendors.map(v => v.vendor_id);
    await TenderModel.updateOne(
      { tender_id },
      { $addToSet: { vendor_details: { $each: vendorIds } } }
    );

    return savedRecord;
  }

  /**
   * Get permitted vendors for a tender (with vendor details populated)
   */
  static async getPermittedVendorsByTender(tender_id) {
    const record = await VendorPermittedModel.findOne({ tender_id });
    if (!record) return null;

    const populatedList = await Promise.all(
      record.listOfPermittedVendors.map(async (pv) => {
        const vendorDetails = await VendorModel.findOne({ vendor_id: pv.vendor_id }).lean();
        return {
          ...pv.toObject(),
          vendor_details: vendorDetails || null
        };
      })
    );

    return { tender_id: record.tender_id, permitted_vendors: populatedList };
  }

  /**
   * Update a permitted vendor entry
   */
  static async updatePermittedVendor(tender_id, vendor_id, updateData) {
    return await VendorPermittedModel.updateOne(
      { tender_id, "listOfPermittedVendors.vendor_id": vendor_id },
      { $set: { "listOfPermittedVendors.$": { vendor_id, ...updateData } } }
    );
  }

  /**
   * Remove permitted vendor AND remove its ID from TenderModel.vendor_details
   */
  static async removePermittedVendor(tender_id, vendor_id) {
    // Remove from VendorPermittedModel
    const result = await VendorPermittedModel.updateOne(
      { tender_id },
      { $pull: { listOfPermittedVendors: { vendor_id } } }
    );

    // Also remove from TenderModel.vendor_details
    await TenderModel.updateOne(
      { tender_id },
      { $pull: { vendor_details: vendor_id } }
    );

    return result;
  }
}

export default VendorPermittedService;
