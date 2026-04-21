import SupplierScorecardService from "./supplierscorecard.service.js";

export const vendors = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const data = await SupplierScorecardService.vendors({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const contractors = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const data = await SupplierScorecardService.contractors({ from_date, to_date });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const vendorDetail = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const data = await SupplierScorecardService.vendorDetail({
      vendor_id: req.params.vendor_id, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const contractorDetail = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const data = await SupplierScorecardService.contractorDetail({
      contractor_id: req.params.contractor_id, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};
