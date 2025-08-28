import VendorPermittedService from "./permittedvendor.service.js";

/**
 * Add permitted vendors
 */
export const addPermittedVendors = async (req, res) => {
  try {
    const { tender_id, vendors } = req.body;
    console.log("Received vendors:", vendors);
    
    const result = await VendorPermittedService.addPermittedVendors(tender_id, vendors);
    res.status(201).json({
      status: true,
      message: "Vendors permitted and added to tender successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/**
 * Get permitted vendors for a tender (with vendor details)
 */
export const getPermittedVendors = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const result = await VendorPermittedService.getPermittedVendorsByTender(tender_id);
    if (!result) {
      return res.status(404).json({ status: false, message: "No permitted vendors found" });
    }
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/**
 * Update a permitted vendor's entry
 */
export const updatePermittedVendor = async (req, res) => {
  try {
    const { tender_id, vendor_id } = req.params;
    const updateData = req.body;
    const result = await VendorPermittedService.updatePermittedVendor(tender_id, vendor_id, updateData);
    res.status(200).json({ status: true, message: "Permitted vendor updated", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/**
 * Remove permitted vendor (also from tender model)
 */
export const removePermittedVendor = async (req, res) => {
  try {
    const { tender_id, vendor_id } = req.params;
    const result = await VendorPermittedService.removePermittedVendor(tender_id, vendor_id);
    res.status(200).json({ status: true, message: "Vendor removed from tender", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const getpaginatedVendor = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const { page = 1, limit = 10, search = "" } = req.query;

    const result = await VendorPermittedService.getVendorsPaginated(
      tender_id,
      parseInt(page),
      parseInt(limit),
      search
    );

    res.json({
      success: true,
      total: result.total,
      data: result.vendors,
    });
  } catch (error) {
    console.error("Error fetching permitted vendors:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};