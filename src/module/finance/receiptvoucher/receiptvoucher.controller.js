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

// GET /receiptvoucher/list?supplier_type=&supplier_id=&tender_id=&status=&receipt_mode=&rv_no=&from_date=&to_date=
export const getList = async (req, res) => {
  try {
    const { supplier_type, supplier_id, tender_id, status, receipt_mode, rv_no, from_date, to_date } = req.query;
    const data = await ReceiptVoucherService.getList({
      supplier_type, supplier_id, tender_id, status, receipt_mode, rv_no, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
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

// POST /receiptvoucher/create
export const create = async (req, res) => {
  try {
    const data = await ReceiptVoucherService.create(req.body);
    res.status(201).json({ status: true, message: "Receipt voucher created", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("not found") ||
                 error.message.includes("Invalid") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /receiptvoucher/approve/:id
export const approve = async (req, res) => {
  try {
    const data = await ReceiptVoucherService.approve(req.params.id);
    res.status(200).json({ status: true, message: "Receipt voucher approved", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
