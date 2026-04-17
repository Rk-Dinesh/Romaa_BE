import ExpenseVoucherService from "./expensevoucher.service.js";

// GET /expensevoucher/next-no
export const getNextEvNo = async (_req, res) => {
  try {
    const data = await ExpenseVoucherService.getNextEvNo();
    res.status(200).json({ status: true, ...data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /expensevoucher/list?status=&payment_mode=&payee_type=&employee_id=&tender_id=&expense_account_code=&paid_from_account_code=&ev_no=&fromdate=&todate=&search=&page=&limit=
export const getList = async (req, res) => {
  try {
    const {
      status, payment_mode, payee_type, employee_id, tender_id,
      expense_account_code, paid_from_account_code, ev_no,
      page, limit, search,
    } = req.query;
    const from_date = req.query.fromdate || req.query.from_date;
    const to_date   = req.query.todate   || req.query.to_date;

    const result = await ExpenseVoucherService.getList({
      status, payment_mode, payee_type, employee_id, tender_id,
      expense_account_code, paid_from_account_code, ev_no,
      from_date, to_date, page, limit, search,
    });

    res.status(200).json({
      status: true,
      currentPage: result.pagination.page,
      totalPages:  result.pagination.pages,
      totalCount:  result.pagination.total,
      data:        result.data,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /expensevoucher/by-tender/:tenderId?status=
export const getByTender = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { status }   = req.query;
    const data = await ExpenseVoucherService.getByTender(tenderId, { status });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /expensevoucher/by-employee/:employeeId?status=&from_date=&to_date=
export const getByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { status, from_date, to_date } = req.query;
    const data = await ExpenseVoucherService.getByEmployee(employeeId, {
      status, from_date, to_date,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /expensevoucher/:id
export const getById = async (req, res) => {
  try {
    const data = await ExpenseVoucherService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /expensevoucher/create
export const create = async (req, res) => {
  try {
    const payload = { ...req.body, created_by: req.user?._id || null };
    const data    = await ExpenseVoucherService.create(payload);
    res.status(201).json({ status: true, message: "Expense voucher created successfully", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("not found") ||
                 error.message.includes("must be") ||
                 error.message.includes("Invalid") ||
                 error.message.includes("group") ||
                 error.message.includes("posting") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /expensevoucher/update/:id
export const update = async (req, res) => {
  try {
    const data = await ExpenseVoucherService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Expense voucher updated successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /expensevoucher/delete/:id
export const deleteDraft = async (req, res) => {
  try {
    const data = await ExpenseVoucherService.deleteDraft(req.params.id);
    res.status(200).json({ status: true, message: "Expense voucher draft removed successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /expensevoucher/approve/:id
export const approve = async (req, res) => {
  try {
    const approvedBy = req.user?._id || null;
    const data = await ExpenseVoucherService.approve(req.params.id, req.body, approvedBy);
    res.status(200).json({ status: true, message: "Expense voucher approved and posted to ledger successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("already") ||
                 error.message.includes("required") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
