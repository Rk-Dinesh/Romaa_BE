import CreditNoteService from "./creditnote.service.js";

// GET /creditnote/next-no
export const getNextCnNo = async (_req, res) => {
  try {
    const data = await CreditNoteService.getNextCnNo();
    res.status(200).json({ status: true, ...data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /creditnote/list?supplier_type=&supplier_id=&tender_id=&status=&adj_type=&tax_type=&cn_no=&from_date=&to_date=
export const getList = async (req, res) => {
  try {
    const { supplier_type, supplier_id, tender_id, status, adj_type, tax_type, cn_no, from_date, to_date } = req.query;
    const data = await CreditNoteService.getList({
      supplier_type, supplier_id, tender_id, status, adj_type, tax_type, cn_no, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /creditnote/by-supplier/:supplierId?supplier_type=&status=&from_date=&to_date=
export const getBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { supplier_type, status, from_date, to_date } = req.query;
    const data = await CreditNoteService.getBySupplier(supplierId, {
      supplier_type, status, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /creditnote/by-tender/:tenderId?supplier_id=&supplier_type=&status=
export const getByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { supplier_id, supplier_type, status } = req.query;
    const data = await CreditNoteService.getByTender(tenderId, {
      supplier_id, supplier_type, status,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// POST /creditnote/create
export const create = async (req, res) => {
  try {
    const data = await CreditNoteService.create(req.body);
    res.status(201).json({ status: true, message: "Credit note created", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("not found") ||
                 error.message.includes("Invalid") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /creditnote/approve/:id
export const approve = async (req, res) => {
  try {
    const data = await CreditNoteService.approve(req.params.id);
    res.status(200).json({ status: true, message: "Credit note approved", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
