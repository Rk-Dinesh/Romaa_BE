import ReceiptVoucherService from "./receiptvoucher.service.js";

// GET /receiptvoucher/next-no
export const getNextRvNo = async (_req, res) => {
  try {
    const data = await ReceiptVoucherService.getNextRvNo();
    res.status(200).json({ status: true, ...data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /receiptvoucher/list?supplier_type=&supplier_id=&tender_id=&status=&receipt_mode=&rv_no=&fromdate=&todate=&search=&page=&limit=
export const getList = async (req, res) => {
  try {
    const { supplier_type, supplier_id, tender_id, status, receipt_mode, rv_no, page, limit, search } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const result = await ReceiptVoucherService.getList({
      supplier_type, supplier_id, tender_id, status, receipt_mode, rv_no, from_date, to_date, page, limit, search,
    });
    res.status(200).json({
      status: true,
      currentPage: result.pagination.page,
      totalPages: result.pagination.pages,
      totalCount: result.pagination.total,
      data: result.data,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /receiptvoucher/list/cash
// Receipt vouchers where receipt_mode = "Cash". Supports same filters except receipt_mode.
export const getListCash = async (req, res) => {
  try {
    const { supplier_type, supplier_id, tender_id, status, rv_no, page, limit, search } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const result = await ReceiptVoucherService.getList({
      supplier_type, supplier_id, tender_id, status, rv_no, from_date, to_date, page, limit, search,
      receipt_mode: "Cash",
    });
    res.status(200).json({
      status: true,
      currentPage: result.pagination.page,
      totalPages: result.pagination.pages,
      totalCount: result.pagination.total,
      data: result.data,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /receiptvoucher/list/bank
// Receipt vouchers where receipt_mode is Cheque / NEFT / RTGS / UPI / DD. Supports same filters.
export const getListBank = async (req, res) => {
  try {
    const { supplier_type, supplier_id, tender_id, status, rv_no, page, limit, search } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const result = await ReceiptVoucherService.getList({
      supplier_type, supplier_id, tender_id, status, rv_no, from_date, to_date, page, limit, search,
      receipt_mode: "bank",
    });
    res.status(200).json({
      status: true,
      currentPage: result.pagination.page,
      totalPages: result.pagination.pages,
      totalCount: result.pagination.total,
      data: result.data,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /receiptvoucher/by-supplier/:supplierId?supplier_type=&status=&from_date=&to_date=
export const getBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { supplier_type, status, from_date, to_date } = req.query;
    const data = await ReceiptVoucherService.getBySupplier(supplierId, {
      supplier_type, status, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /receiptvoucher/by-tender/:tenderId?supplier_id=&supplier_type=&status=
export const getByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { supplier_id, supplier_type, status } = req.query;
    const data = await ReceiptVoucherService.getByTender(tenderId, {
      supplier_id, supplier_type, status,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /receiptvoucher/:id
export const getById = async (req, res) => {
  try {
    const data = await ReceiptVoucherService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /receiptvoucher/create
export const create = async (req, res) => {
  try {
    const data = await ReceiptVoucherService.create(req.body);
    res.status(201).json({ status: true, message: "Receipt voucher created successfully", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("not found") ||
                 error.message.includes("Invalid") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /receiptvoucher/update/:id
export const update = async (req, res) => {
  try {
    const data = await ReceiptVoucherService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Receipt voucher updated successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /receiptvoucher/delete/:id
export const deleteDraft = async (req, res) => {
  try {
    const data = await ReceiptVoucherService.deleteDraft(req.params.id);
    res.status(200).json({ status: true, message: "Receipt voucher draft removed successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /receiptvoucher/approve/:id
export const approve = async (req, res) => {
  try {
    const data = await ReceiptVoucherService.approve(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Receipt voucher approved and posted to ledger successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
