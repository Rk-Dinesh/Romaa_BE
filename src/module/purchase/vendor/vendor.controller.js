import VendorService from "./vendor.service.js";

// Create Vendor
export const createVendor = async (req, res) => {
  try {
    const data = await VendorService.addVendor(req.body);
    res.status(201).json({ status: true, message: "Vendor created", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get All Vendors
export const getAllVendors = async (req, res) => {
  try {
    const data = await VendorService.getAllVendors();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllVendorsSelect = async (req, res) => {
  try {
    const type = req.query.type || "";
    const data = await VendorService.getAllVendorsSelect(type);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get Vendor by ID
export const getVendorById = async (req, res) => {
  try {
    const data = await VendorService.getVendorById(req.params.vendor_id);
    if (!data) return res.status(404).json({ status: false, message: "Vendor not found" });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get Active Vendors
export const getActiveVendors = async (req, res) => {
  try {
    const data = await VendorService.getActiveVendors();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update Vendor
export const updateVendor = async (req, res) => {
  try {
    const data = await VendorService.updateVendor(req.params.vendor_id, req.body);
    if (!data) return res.status(404).json({ status: false, message: "Vendor not found" });
    res.status(200).json({ status: true, message: "Vendor updated", data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Delete Vendor
export const deleteVendor = async (req, res) => {
  try {
    const data = await VendorService.deleteVendor(req.params.vendor_id);
    if (!data) return res.status(404).json({ status: false, message: "Vendor not found" });
    res.status(200).json({ status: true, message: "Vendor deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Search Vendors
export const searchVendors = async (req, res) => {
  try {
    const data = await VendorService.searchVendors(req.query.q || "");
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// vendor.controller.js

// 📌 Get paginated vendors with search + date filter
export const getVendorsPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fromdate = req.query.fromdate || null;
    const todate = req.query.todate || null;

    const data = await VendorService.getVendorsPaginated(
      page,
      limit,
      search,
      fromdate,
      todate
    );

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalRecords: data.total,
      data: data.vendors
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

