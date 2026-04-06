import DebitNoteService from "./debitnote.service.js";

// GET /debitnote/next-no
export const getNextDnNo = async (_req, res) => {
  try {
    const data = await DebitNoteService.getNextDnNo();
    res.status(200).json({ status: true, ...data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /debitnote/list?supplier_type=&supplier_id=&tender_id=&status=&adj_type=&tax_type=&dn_no=&from_date=&to_date=&page=&limit=
export const getList = async (req, res) => {
  try {
    const { supplier_type, supplier_id, tender_id, status, adj_type, tax_type, dn_no, from_date, to_date, page, limit } = req.query;
    const result = await DebitNoteService.getList({
      supplier_type, supplier_id, tender_id, status, adj_type, tax_type, dn_no, from_date, to_date, page, limit,
    });
    res.status(200).json({ status: true, ...result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /debitnote/by-supplier/:supplierId?supplier_type=&status=&from_date=&to_date=
export const getBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { supplier_type, status, from_date, to_date } = req.query;
    const data = await DebitNoteService.getBySupplier(supplierId, {
      supplier_type, status, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /debitnote/by-tender/:tenderId?supplier_id=&supplier_type=&status=
export const getByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { supplier_id, supplier_type, status } = req.query;
    const data = await DebitNoteService.getByTender(tenderId, {
      supplier_id, supplier_type, status,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /debitnote/:id
export const getById = async (req, res) => {
  try {
    const data = await DebitNoteService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /debitnote/create
export const create = async (req, res) => {
  try {
    const data = await DebitNoteService.create(req.body);
    res.status(201).json({ status: true, message: "Debit note created successfully", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("not found") ||
                 error.message.includes("Invalid") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /debitnote/update/:id
export const update = async (req, res) => {
  try {
    const data = await DebitNoteService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Debit note updated successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /debitnote/delete/:id
export const deleteDraft = async (req, res) => {
  try {
    const data = await DebitNoteService.deleteDraft(req.params.id);
    res.status(200).json({ status: true, message: "Debit note draft removed successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /debitnote/approve/:id
export const approve = async (req, res) => {
  try {
    const data = await DebitNoteService.approve(req.params.id);
    res.status(200).json({ status: true, message: "Debit note approved and posted to ledger successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
