import RecurringVoucherService from "./recurringvoucher.service.js";

export const create = async (req, res) => {
  try {
    const data = await RecurringVoucherService.create({
      ...req.body,
      created_by: req.user?.name || req.user?.employeeId || req.body.created_by || "",
    });
    res.status(201).json({ status: true, message: "Recurring template created", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const getList = async (req, res) => {
  try {
    const { status, voucher_type, template_no, search, page, limit } = req.query;
    const result = await RecurringVoucherService.getList({
      status, voucher_type, template_no, search, page, limit,
    });
    res.status(200).json({
      status: true,
      currentPage: result.pagination.page,
      totalPages:  result.pagination.pages,
      totalCount:  result.pagination.total,
      data: result.data,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getById = async (req, res) => {
  try {
    const data = await RecurringVoucherService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const update = async (req, res) => {
  try {
    const data = await RecurringVoucherService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Template updated", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const pause = async (req, res) => {
  try {
    const data = await RecurringVoucherService.pause(req.params.id);
    res.status(200).json({ status: true, message: "Template paused", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const resume = async (req, res) => {
  try {
    const data = await RecurringVoucherService.resume(req.params.id);
    res.status(200).json({ status: true, message: "Template resumed", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const endTemplate = async (req, res) => {
  try {
    const data = await RecurringVoucherService.endTemplate(req.params.id);
    res.status(200).json({ status: true, message: "Template ended", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const remove = async (req, res) => {
  try {
    const data = await RecurringVoucherService.remove(req.params.id);
    res.status(200).json({ status: true, message: "Template deleted", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const runNow = async (req, res) => {
  try {
    const data = await RecurringVoucherService.runNow(req.params.id);
    res.status(200).json({ status: true, message: "Template fired", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const runDue = async (req, res) => {
  try {
    const asOf = req.query.as_of ? new Date(req.query.as_of) : new Date();
    const data = await RecurringVoucherService.runDue(asOf);
    res.status(200).json({ status: true, message: "Run-due cycle complete", data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
