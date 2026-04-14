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

// GET /banktransfer/list?status=&tender_id=&transfer_no=&fromdate=&todate=&search=&page=&limit=
export const getList = async (req, res) => {
  try {
    const { status, tender_id, from_account_code, to_account_code, transfer_no, page, limit, search } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const result = await BankTransferService.getList({
      status, tender_id, from_account_code, to_account_code, transfer_no,
      from_date, to_date, page, limit, search,
    });
    res.status(200).json({
      status: true,
      currentPage: result.pagination.page,
      totalPages: result.pagination.pages,
      totalCount: result.pagination.total,
      data: result.data,
    });
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
    res.status(201).json({ status: true, message: "Bank transfer created successfully", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// PATCH /banktransfer/update/:id
export const update = async (req, res) => {
  try {
    const data = await BankTransferService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Bank transfer updated successfully", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// DELETE /banktransfer/delete/:id
export const deleteDraft = async (req, res) => {
  try {
    const data = await BankTransferService.deleteDraft(req.params.id);
    res.status(200).json({ status: true, message: "Bank transfer removed successfully", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

// PATCH /banktransfer/approve/:id
export const approve = async (req, res) => {
  try {
    const approvedBy = req.user?._id || null;
    const data = await BankTransferService.approve(req.params.id, approvedBy);
    res.status(200).json({ status: true, message: "Bank transfer approved and account balances updated successfully", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
