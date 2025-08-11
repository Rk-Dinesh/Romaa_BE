import VendorModel from "./vendor.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

class VendorService {
  // Create Vendor
  static async addVendor(vendorData) {
    const idname = "VENDOR";
    const idcode = "VEN";
    await IdcodeServices.addIdCode(idname, idcode);
    const vendor_id = await IdcodeServices.generateCode(idname);
    if (!vendor_id) throw new Error("Failed to generate vendor ID");

    const vendor = new VendorModel({
      vendor_id,
      ...vendorData
    });
    return await vendor.save();
  }

  // Get all vendors
  static async getAllVendors() {
    return await VendorModel.find();
  }

  // Get vendor by ID
  static async getVendorById(vendor_id) {
    return await VendorModel.findOne({ vendor_id });
  }

  // Get active vendors
  static async getActiveVendors() {
    return await VendorModel.find({ status: "ACTIVE" });
  }

  // Update vendor
  static async updateVendor(vendor_id, updateData) {
    return await VendorModel.findOneAndUpdate(
      { vendor_id },
      { $set: updateData },
      { new: true }
    );
  }

  // Delete vendor
  static async deleteVendor(vendor_id) {
    return await VendorModel.findOneAndDelete({ vendor_id });
  }

  // Search vendors
  static async searchVendors(keyword) {
    return await VendorModel.find({
      $or: [
        { company_name: { $regex: keyword, $options: "i" } },
        { contact_email: { $regex: keyword, $options: "i" } },
        { contact_phone: { $regex: keyword, $options: "i" } },
      ]
    });
  }
}

export default VendorService;
