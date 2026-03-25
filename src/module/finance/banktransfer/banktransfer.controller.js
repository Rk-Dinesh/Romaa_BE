import BankTransferService from "./banktransfer.service.js";

// GET /banktransfer/next-no
export const getNextTransferNo = async (_req, res) => {
  try {
    const data = await BankTransferService.getNextTransferNo();
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// GET /banktransfer/list
export const getList = async (req, res) => {
  try {
    const data = await BankTransferService.getList(req.query);
    res.status(200).json({ status: true, ...data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// GET /banktransfer/:id
export const getById = async (req, res) => {
  try {
    const data = await BankTransferService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

// POST /banktransfer/create
export const create = async (req, res) => {
  try {
    const data = await BankTransferService.create(req.body);
    res.status(201).json({ status: true, message: "Bank transfer created", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// PATCH /banktransfer/update/:id
export const update = async (req, res) => {
  try {
    const data = await BankTransferService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Bank transfer updated", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// DELETE /banktransfer/delete/:id
export const deleteDraft = async (req, res) => {
  try {
    const data = await BankTransferService.deleteDraft(req.params.id);
    res.status(200).json({ status: true, message: "Bank transfer deleted", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// PATCH /banktransfer/approve/:id
export const approve = async (req, res) => {
  try {
    const approvedBy = req.user?._id || null;
    const data = await BankTransferService.approve(req.params.id, approvedBy);
    res.status(200).json({ status: true, message: "Bank transfer approved", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
