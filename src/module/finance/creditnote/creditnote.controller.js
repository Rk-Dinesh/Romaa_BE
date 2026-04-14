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

// GET /creditnote/list?supplier_type=&supplier_id=&tender_id=&status=&adj_type=&tax_type=&cn_no=&fromdate=&todate=&search=&page=&limit=
export const getList = async (req, res) => {
  try {
    const { supplier_type, supplier_id, tender_id, status, adj_type, tax_type, cn_no, page, limit, search } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const result = await CreditNoteService.getList({
      supplier_type, supplier_id, tender_id, status, adj_type, tax_type, cn_no, from_date, to_date, page, limit, search,
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

// GET /creditnote/by-supplier/:supplierId?supplier_type=&status=&fromdate=&todate=&search=&page=&limit=
export const getBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { supplier_type, status, page, limit, search } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const result = await CreditNoteService.getBySupplier(supplierId, {
      supplier_type, status, from_date, to_date, page, limit, search,
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

// GET /creditnote/by-tender/:tenderId?supplier_id=&supplier_type=&status=&fromdate=&todate=&search=&page=&limit=
export const getByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { supplier_id, supplier_type, status, page, limit, search } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;
    const result = await CreditNoteService.getByTender(tenderId, {
      supplier_id, supplier_type, status, from_date, to_date, page, limit, search,
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

// GET /creditnote/:id
export const getById = async (req, res) => {
  try {
    const data = await CreditNoteService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /creditnote/create
export const create = async (req, res) => {
  try {
    const data = await CreditNoteService.create(req.body);
    res.status(201).json({ status: true, message: "Credit note created successfully", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("not found") ||
                 error.message.includes("Invalid") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /creditnote/update/:id
export const update = async (req, res) => {
  try {
    const data = await CreditNoteService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Credit note updated successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /creditnote/delete/:id
export const deleteDraft = async (req, res) => {
  try {
    const data = await CreditNoteService.deleteDraft(req.params.id);
    res.status(200).json({ status: true, message: "Credit note draft removed successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /creditnote/approve/:id
export const approve = async (req, res) => {
  try {
    const data = await CreditNoteService.approve(req.params.id);
    res.status(200).json({ status: true, message: "Credit note approved and posted to ledger successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
