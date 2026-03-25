import CompanyCashAccountService from "./companycashaccount.service.js";

// GET /companycashaccount/list
export const getAll = async (req, res) => {
  try {
    const data = await CompanyCashAccountService.getAll();
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /companycashaccount/by-code/:code
export const getByCode = async (req, res) => {
  try {
    const data = await CompanyCashAccountService.getByCode(req.params.code);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /companycashaccount/:id
export const getById = async (req, res) => {
  try {
    const data = await CompanyCashAccountService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /companycashaccount/create
export const create = async (req, res) => {
  try {
    const data = await CompanyCashAccountService.create(req.body, req.user?.emp_id || "");
    res.status(201).json({ status: true, message: "Company cash account created", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("already exists") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /companycashaccount/update/:id
export const update = async (req, res) => {
  try {
    const data = await CompanyCashAccountService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Company cash account updated", data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /companycashaccount/delete/:id
export const softDelete = async (req, res) => {
  try {
    const data = await CompanyCashAccountService.softDelete(req.params.id);
    res.status(200).json({ status: true, message: "Company cash account deleted", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
