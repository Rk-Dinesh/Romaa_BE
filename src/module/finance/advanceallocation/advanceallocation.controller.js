import AdvanceAllocationService from "./advanceallocation.service.js";

export const getOutstandingPaid = async (req, res) => {
  try {
    const { party_type, party_id, tender_id } = req.query;
    const data = await AdvanceAllocationService.getOutstandingPaid({ party_type, party_id, tender_id });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getOutstandingReceived = async (req, res) => {
  try {
    const { party_type, party_id, tender_id } = req.query;
    const data = await AdvanceAllocationService.getOutstandingReceived({ party_type, party_id, tender_id });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getSummary = async (req, res) => {
  try {
    const { side, tender_id } = req.query;
    const data = await AdvanceAllocationService.getSummaryByParty({ side, tender_id });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const allocate = async (req, res) => {
  try {
    const data = await AdvanceAllocationService.allocate(req.body);
    res.status(200).json({ status: true, message: "Allocated", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const unallocate = async (req, res) => {
  try {
    const data = await AdvanceAllocationService.unallocate(req.body);
    res.status(200).json({ status: true, message: "Un-allocated", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const getVoucherAllocations = async (req, res) => {
  try {
    const { voucher_type } = req.query;
    const data = await AdvanceAllocationService.getVoucherAllocations(voucher_type, req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const getBillSettlements = async (req, res) => {
  try {
    const { bill_type } = req.query;
    const data = await AdvanceAllocationService.getBillSettlements(bill_type, req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
