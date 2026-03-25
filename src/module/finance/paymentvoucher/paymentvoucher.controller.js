import PaymentVoucherService from "./paymentvoucher.service.js";

// GET /paymentvoucher/next-no
export const getNextPvNo = async (_req, res) => {
  try {
    const data = await PaymentVoucherService.getNextPvNo();
    res.status(200).json({ status: true, ...data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /paymentvoucher/list?supplier_type=&supplier_id=&tender_id=&status=&payment_mode=&pv_no=&from_date=&to_date=&page=&limit=
export const getList = async (req, res) => {
  try {
    const { supplier_type, supplier_id, tender_id, status, payment_mode, pv_no, from_date, to_date, page, limit } = req.query;
    const result = await PaymentVoucherService.getList({
      supplier_type, supplier_id, tender_id, status, payment_mode, pv_no, from_date, to_date, page, limit,
    });
    res.status(200).json({ status: true, ...result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /paymentvoucher/by-supplier/:supplierId?supplier_type=&status=&from_date=&to_date=&page=&limit=
export const getBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { supplier_type, status, from_date, to_date, page, limit } = req.query;
    const result = await PaymentVoucherService.getBySupplier(supplierId, {
      supplier_type, status, from_date, to_date, page, limit,
    });
    res.status(200).json({ status: true, ...result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /paymentvoucher/by-tender/:tenderId?supplier_id=&supplier_type=&status=
export const getByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { supplier_id, supplier_type, status } = req.query;
    const data = await PaymentVoucherService.getByTender(tenderId, {
      supplier_id, supplier_type, status,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /paymentvoucher/:id
export const getById = async (req, res) => {
  try {
    const data = await PaymentVoucherService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /paymentvoucher/create
export const create = async (req, res) => {
  try {
    const data = await PaymentVoucherService.create(req.body);
    res.status(201).json({ status: true, message: "Payment voucher created", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("not found") ||
                 error.message.includes("Invalid") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /paymentvoucher/update/:id
export const update = async (req, res) => {
  try {
    const data = await PaymentVoucherService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Payment voucher updated", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /paymentvoucher/delete/:id
export const deleteDraft = async (req, res) => {
  try {
    const data = await PaymentVoucherService.deleteDraft(req.params.id);
    res.status(200).json({ status: true, message: "Payment voucher deleted", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /paymentvoucher/approve/:id
export const approve = async (req, res) => {
  try {
    const data = await PaymentVoucherService.approve(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Payment voucher approved", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
