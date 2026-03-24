import AccountTreeService from "./accounttree.service.js";

// GET /accounttree/list
// ?account_type=&account_subtype=&parent_code=&is_group=&is_posting_account=&is_bank_cash=&is_personal=&is_active=&tax_type=
export const getAll = async (req, res) => {
  try {
    const { account_type, account_subtype, parent_code, tax_type,
            is_group, is_posting_account, is_bank_cash, is_personal, is_active } = req.query;
    const data = await AccountTreeService.getAll({
      account_type, account_subtype, parent_code, tax_type,
      is_group, is_posting_account, is_bank_cash, is_personal, is_active,
    });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /accounttree/posting-accounts
// ?account_type=&is_bank_cash=&tax_type=
export const getPostingAccounts = async (req, res) => {
  try {
    const { account_type, is_bank_cash, tax_type } = req.query;
    const data = await AccountTreeService.getPostingAccounts({ account_type, is_bank_cash, tax_type });
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /accounttree/tree?root=1000
export const getTree = async (req, res) => {
  try {
    const data = await AccountTreeService.getTree(req.query.root || null);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /accounttree/search?q=CGST
export const search = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ status: false, message: "q is required" });
    const data = await AccountTreeService.search(q);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /accounttree/by-code/:code
export const getByCode = async (req, res) => {
  try {
    const data = await AccountTreeService.getByCode(req.params.code);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// GET /accounttree/by-supplier/:supplierId?supplier_type=Vendor
export const getBySupplier = async (req, res) => {
  try {
    const data = await AccountTreeService.getBySupplier(req.params.supplierId, req.query.supplier_type);
    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// POST /accounttree/create
export const create = async (req, res) => {
  try {
    const data = await AccountTreeService.create(req.body);
    res.status(201).json({ status: true, message: "Account created", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("duplicate") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /accounttree/update/:id
export const update = async (req, res) => {
  try {
    const data = await AccountTreeService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Account updated", data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 :
                 error.message.includes("Cannot change") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /accounttree/delete/:id
export const softDelete = async (req, res) => {
  try {
    const data = await AccountTreeService.softDelete(req.params.id);
    res.status(200).json({ status: true, message: "Account deleted", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Cannot delete") ||
                 error.message.includes("Already") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /accounttree/seed
export const seedAccounts = async (req, res) => {
  try {
    const result = await AccountTreeService.seedDefaultAccounts();
    res.status(200).json({ status: true, ...result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
