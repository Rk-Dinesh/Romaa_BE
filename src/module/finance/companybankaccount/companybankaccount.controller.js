import CompanyBankAccountService from "./companybankaccount.service.js";

// GET /companybankaccount/list
export const getAll = async (req, res) => {
  try {
    const data = await CompanyBankAccountService.getAll();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /companybankaccount/by-code/:code
export const getByCode = async (req, res) => {
  try {
    const data = await CompanyBankAccountService.getByCode(req.params.code);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /companybankaccount/:id
export const getById = async (req, res) => {
  try {
    const data = await CompanyBankAccountService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /companybankaccount/create
export const create = async (req, res) => {
  try {
    const data = await CompanyBankAccountService.create(req.body, req.user?.emp_id || "");
    res.status(201).json({ status: true, message: "Company bank account registered successfully", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("already exists") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /companybankaccount/update/:id
export const update = async (req, res) => {
  try {
    const data = await CompanyBankAccountService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Company bank account updated successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /companybankaccount/delete/:id
export const softDelete = async (req, res) => {
  try {
    const data = await CompanyBankAccountService.softDelete(req.params.id);
    res.status(200).json({ status: true, message: "Company bank account deactivated successfully", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
